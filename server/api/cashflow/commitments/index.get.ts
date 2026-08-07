/**
 * GET /api/cashflow/commitments
 *
 * Lists forecast-only commitments for the selected tenant. Query params:
 *  - status: filter to one status (expected|hold|disputed|matched|closed).
 *    Defaults to all open (everything except closed).
 */

import { defineEventHandler, createError, getQuery } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

const STATUSES = new Set(['expected', 'hold', 'disputed', 'matched', 'closed'])

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const status = String(getQuery(event).status ?? '')
  const filter = STATUSES.has(status) ? 'AND status = $2' : `AND status <> 'closed'`
  const params: unknown[] = STATUSES.has(status) ? [tenantId, status] : [tenantId]

  const commitments = await queryRows(
    `SELECT id, supplier, contact_id, description, amount_cents::text AS amount_cents,
            TO_CHAR(expected_date, 'YYYY-MM-DD') AS expected_date,
            recurrence, TO_CHAR(recurrence_end, 'YYYY-MM-DD') AS recurrence_end,
            payment_account, status, confidence, owner, notes, source,
            matched_invoice_id, created_at, updated_at
     FROM cashflow_commitments
     WHERE tenant_id = $1 ${filter}
     ORDER BY expected_date ASC, supplier ASC`,
    params,
  )
  return { commitments }
})
