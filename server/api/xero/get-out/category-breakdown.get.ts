/**
 * GET /api/xero/get-out/category-breakdown?month=YYYY-MM
 *
 * Revenue by Xero account code for a month, from the line-item cache, with REAL
 * account names (xero_accounts_cache). Defaults to the last COMPLETE month so
 * the breakdown is full and meaningful — the live current month is partial early
 * on and shows only a category or two.
 */

import { defineEventHandler, createError, getQuery } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const q = getQuery(event)
  const now = new Date()
  let year: number
  let month: number
  const m = typeof q.month === 'string' ? /^(\d{4})-(\d{2})$/.exec(q.month) : null
  if (m) {
    year = Number(m[1]); month = Number(m[2])
  } else {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1) // last complete month
    year = d.getFullYear(); month = d.getMonth() + 1
  }
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonthStart = new Date(year, month, 1).toISOString().slice(0, 10)
  const monthLabel = new Date(year, month - 1, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' })

  const rows = await queryRows<{ code: string | null; name: string | null; lines: string; ex_gst: string }>(
    `SELECT l.account_code AS code,
            a.name AS name,
            COUNT(*)::text AS lines,
            COALESCE(SUM(l.line_ex_gst_cents), 0)::text AS ex_gst
       FROM xero_invoice_lines_cache l
       LEFT JOIN xero_accounts_cache a ON a.tenant_id = l.tenant_id AND a.code = l.account_code
      WHERE l.tenant_id = $1
        AND l.invoice_type = 'ACCREC'
        AND l.invoice_date >= $2::date AND l.invoice_date < $3::date
      GROUP BY l.account_code, a.name
      HAVING COALESCE(SUM(l.line_ex_gst_cents), 0) <> 0
      ORDER BY SUM(l.line_ex_gst_cents) DESC`,
    [tenantId, monthStart, nextMonthStart],
  )

  const categories = rows.map(r => ({
    code: r.code ?? '—',
    name: r.name ?? (r.code ? `Account ${r.code}` : 'Uncategorised'),
    lines: Number(r.lines),
    total: Math.round((Number(r.ex_gst) / 100) * 100) / 100,
  }))

  return {
    month: { year, month, label: monthLabel },
    categoryCount: categories.length,
    total: Math.round((categories.reduce((s, c) => s + c.total, 0)) * 100) / 100,
    categories,
  }
})
