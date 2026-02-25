/**
 * POST /api/agency/eom/runs/:id/push-to-xero
 * Push EOM invoices to Xero as DRAFT invoices.
 * Requires run to be in 'review' status and all contacts to be valid.
 */

import { createError, getRouterParam } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { validateContacts, buildXeroPayload, batchCreateInvoices } from '~~/server/utils/xeroInvoiceWriter'

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const runId = getRouterParam(event, 'id')

  if (!runId) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })
  }

  // Verify run exists and is in 'review' status
  const run = await queryOne<{ id: string; status: string; month: number; year: number }>(
    `SELECT id, status, month, year FROM eom_runs WHERE id = $1`,
    [runId],
  )

  if (!run) {
    throw createError({ statusCode: 404, statusMessage: 'EOM run not found' })
  }

  if (run.status !== 'review') {
    throw createError({
      statusCode: 400,
      statusMessage: `Cannot push run in '${run.status}' status. Must be 'review'.`,
    })
  }

  // Validate contacts first
  const contacts = await validateContacts(event, runId)
  if (contacts.unmatched.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `${contacts.unmatched.length} unmatched contacts. Validate contacts first.`,
    })
  }

  // Build and push
  const invoices = await buildXeroPayload(runId, run.month, run.year)
  const result = await batchCreateInvoices(event, runId, invoices)

  return result
})
