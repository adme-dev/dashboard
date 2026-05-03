/**
 * GET /api/xero/get-out/history
 *
 * Last N (default 12) months of Get Out performance:
 *   target (constant — derived from current config), invoiced (from cache),
 *   hit/miss, % of target.
 *
 * Note: target is computed from TODAY's config — we don't store historical
 * snapshots of the config. So a config change today rewrites perceived
 * historical performance. Acceptable trade-off given how rarely the config
 * changes.
 */

import { defineEventHandler, getQuery, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'

interface MonthRow {
  month_start: string
  invoiced_cents: string | number
  invoice_count: number
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const query = getQuery(event)
  const monthsBack = Math.max(1, Math.min(36, Number(query.months) || 12))

  const config = await loadGetOutConfig(tenantId)
  const target = summariseConfig(config).totalCents / 100

  const rows = await queryRows<MonthRow>(
    `SELECT TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM-01') AS month_start,
            SUM(total_cents)::text AS invoiced_cents,
            COUNT(*)::int AS invoice_count
       FROM xero_invoices_cache
       WHERE tenant_id = $1
         AND type = 'ACCREC'
         AND status NOT IN ('VOIDED','DRAFT','DELETED')
         AND date >= DATE_TRUNC('month', CURRENT_DATE - ($2 || ' months')::interval)
       GROUP BY DATE_TRUNC('month', date)
       ORDER BY month_start ASC`,
    [tenantId, monthsBack - 1],
  )

  // Build a complete month series — even months with zero invoicing should
  // appear in the chart so the trend isn't deceptive.
  const today = new Date()
  const months: Array<{ monthStart: string; monthLabel: string; invoiced: number; target: number; hit: boolean; pctOfTarget: number; invoiceCount: number }> = []
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const found = rows.find(r => String(r.month_start).startsWith(monthStart.slice(0, 7)))
    const invoiced = found ? Number(found.invoiced_cents) / 100 : 0
    const invoiceCount = found ? Number(found.invoice_count) : 0
    months.push({
      monthStart,
      monthLabel: d.toLocaleString('en-AU', { month: 'short', year: '2-digit' }),
      invoiced: Math.round(invoiced * 100) / 100,
      target: Math.round(target * 100) / 100,
      hit: invoiced >= target,
      pctOfTarget: target > 0 ? Math.round((invoiced / target) * 1000) / 10 : 0,
      invoiceCount,
    })
  }

  const hitCount = months.filter(m => m.hit).length
  const avgPct = months.length > 0
    ? Math.round(months.reduce((s, m) => s + m.pctOfTarget, 0) / months.length * 10) / 10
    : 0

  return {
    months,
    summary: {
      monthsTracked: months.length,
      hitCount,
      missCount: months.length - hitCount,
      hitRate: months.length > 0 ? Math.round((hitCount / months.length) * 1000) / 10 : 0,
      avgPctOfTarget: avgPct,
      currentTarget: target,
    },
  }
})
