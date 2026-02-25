/**
 * GET /api/agency/eom/runs/:id/summary
 * Get breakdown summaries: GST, COA, client totals, source breakdown
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Run ID is required' })
  }

  // GST breakdown
  const gstBreakdown = await queryRows(
    `SELECT tax_type,
            COUNT(*) as line_count,
            SUM(unit_amount * quantity) as total_ex_gst,
            SUM(CASE WHEN tax_type IN ('GST on Income','GST on Expenses')
                     THEN unit_amount * quantity * 0.10 ELSE 0 END) as gst_amount
     FROM eom_line_items WHERE run_id = $1
     GROUP BY tax_type
     ORDER BY tax_type`,
    [id],
  )

  // COA breakdown
  const coaBreakdown = await queryRows(
    `SELECT account_code,
            COUNT(*) as line_count,
            SUM(unit_amount * quantity) as total_ex_gst
     FROM eom_line_items WHERE run_id = $1
     GROUP BY account_code
     ORDER BY account_code`,
    [id],
  )

  // Client totals
  const clientTotals = await queryRows(
    `SELECT client_name,
            invoice_number,
            COUNT(*) as line_count,
            SUM(unit_amount * quantity) as total_ex_gst,
            SUM(CASE WHEN tax_type IN ('GST on Income','GST on Expenses')
                     THEN unit_amount * quantity * 0.10 ELSE 0 END) as gst_amount
     FROM eom_line_items WHERE run_id = $1
     GROUP BY client_name, invoice_number
     ORDER BY client_name`,
    [id],
  )

  // Source breakdown
  const sourceBreakdown = await queryRows(
    `SELECT source,
            COUNT(*) as line_count,
            SUM(unit_amount * quantity) as total_ex_gst
     FROM eom_line_items WHERE run_id = $1
     GROUP BY source
     ORDER BY source`,
    [id],
  )

  return {
    gstBreakdown,
    coaBreakdown,
    clientTotals,
    sourceBreakdown,
  }
})
