/**
 * GET /api/agency/eom/runs/:id/xero-status
 * Check pushed invoice statuses from Xero API.
 * Returns per-invoice status and a summary breakdown.
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { getInvoiceStatuses } from '~~/server/utils/xeroInvoiceWriter'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const runId = getRouterParam(event, 'id')

  if (!runId) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })
  }

  // Get distinct invoice numbers for this run
  const rows = await queryRows<{ invoice_number: number }>(
    `SELECT DISTINCT invoice_number FROM eom_line_items WHERE run_id = $1 AND invoice_number IS NOT NULL ORDER BY invoice_number`,
    [runId],
  )

  if (rows.length === 0) {
    return {
      invoices: [],
      summary: { draft: 0, authorised: 0, paid: 0, total: 0 },
    }
  }

  const invoiceNumbers = rows.map(r => String(r.invoice_number))
  const statuses = await getInvoiceStatuses(event, invoiceNumbers)

  const summary = {
    draft: statuses.filter(s => s.status === 'DRAFT').length,
    authorised: statuses.filter(s => ['AUTHORISED', 'SUBMITTED'].includes(s.status)).length,
    paid: statuses.filter(s => s.status === 'PAID').length,
    total: statuses.length,
  }

  return { invoices: statuses, summary }
})
