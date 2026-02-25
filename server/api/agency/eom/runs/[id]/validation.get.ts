/**
 * GET /api/agency/eom/runs/:id/validation
 * Run sanity checks on an EOM run
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { runSanityChecks } from '~~/server/utils/eomValidation'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })
  }

  try {
    return await runSanityChecks(id)
  } catch (err: any) {
    console.error('[EOM] Validation failed:', err)
    throw createError({
      statusCode: 500,
      statusMessage: `Validation failed: ${err.message}`,
    })
  }
})
