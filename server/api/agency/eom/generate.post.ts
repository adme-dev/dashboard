/**
 * POST /api/agency/eom/generate
 * Generate EOM invoices for a given month/year.
 *
 * With ?async=true, enqueues the job and returns immediately.
 * Without async flag (or when queue unavailable), runs synchronously.
 */

import { createError, readBody } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { generateEomInvoices } from '~~/server/utils/eomEngine'
import { enqueue } from '~~/server/utils/queue'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const month = body?.month
  const year = body?.year
  const async = body?.async === true

  if (!month || !year) {
    throw createError({ statusCode: 400, statusMessage: 'month and year are required' })
  }

  if (month < 1 || month > 12) {
    throw createError({ statusCode: 400, statusMessage: 'month must be between 1 and 12' })
  }

  if (year < 2020 || year > 2100) {
    throw createError({ statusCode: 400, statusMessage: 'year must be between 2020 and 2100' })
  }

  // Async mode: enqueue and return immediately
  if (async) {
    const enqueued = await enqueue(event, 'eom.generate', {
      userId: user.id,
      month,
      year,
    })

    if (enqueued) {
      return { status: 'queued', message: `EOM generation for ${month}/${year} has been queued` }
    }
    // If queue unavailable, fall through to synchronous execution
  }

  // Synchronous mode (default or queue fallback)
  try {
    const result = await generateEomInvoices(user.id, month, year, event)
    return result
  } catch (err: any) {
    if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
      throw createError({
        statusCode: 409,
        statusMessage: `An EOM run for ${month}/${year} already exists`,
      })
    }
    console.error('[EOM] Generation failed:', err)
    throw createError({
      statusCode: 500,
      statusMessage: `Invoice generation failed: ${err.message}`,
    })
  }
})
