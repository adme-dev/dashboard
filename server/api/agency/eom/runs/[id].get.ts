/**
 * GET /api/agency/eom/runs/:id
 * Get full details of a single EOM run
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })
  }

  const run = await queryOne(
    `SELECT id, month, year, status, total_ex_gst, total_gst,
            invoice_count, line_item_count, flagged_count,
            first_invoice_number, last_invoice_number,
            xero_batch_id, notes, created_by, created_at, updated_at
     FROM eom_runs WHERE id = $1`,
    [id],
  )

  if (!run) {
    throw createError({ statusCode: 404, statusMessage: 'EOM run not found' })
  }

  return run
})
