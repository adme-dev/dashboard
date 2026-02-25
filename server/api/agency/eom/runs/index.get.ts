/**
 * GET /api/agency/eom/runs
 * List EOM runs, optionally filtered by year
 */

import { getQuery } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const year = query.year ? Number(query.year) : null

  const params: any[] = []
  let sql = `SELECT id, month, year, status, total_ex_gst, total_gst,
                    invoice_count, line_item_count, flagged_count,
                    first_invoice_number, last_invoice_number,
                    xero_batch_id, notes, created_by, created_at, updated_at
             FROM eom_runs`

  if (year) {
    sql += ` WHERE year = $1`
    params.push(year)
  }

  sql += ` ORDER BY year DESC, month DESC`

  return await queryRows(sql, params)
})
