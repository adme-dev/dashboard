/**
 * GET /api/xero/get-out/agi?months=13
 *
 * Agency Gross Income from cached line items:
 *   AGI = Σ ACCREC revenue (ex-GST) − Σ ACCPAY direct costs (ex-GST, Xero
 *         DIRECTCOSTS accounts).
 *
 * Reads xero_invoice_lines_cache (no live Xero call) so it's fast and stable.
 * Trailing 3/12-month figures smooth accrual timing; the current partial month
 * is excluded from those averages.
 *
 * The direct-cost account codes are configurable via
 *   agency_settings.key = 'direct_cost_account_codes' → { codes: [...] }
 * defaulting to this org's DIRECTCOSTS set.
 */

import { defineEventHandler, createError, getQuery } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryRows, queryOne } from '~~/server/utils/db'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'
import { buildAgiSeries, DEFAULT_DIRECT_COST_CODES } from '~~/server/utils/agi'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const q = getQuery(event)
  const months = Math.min(24, Math.max(1, Number(q.months) || 13))

  const cfgRow = await queryOne<{ value: any }>(
    `SELECT value FROM agency_settings WHERE tenant_id = $1 AND key = 'direct_cost_account_codes'`,
    [tenantId],
  )
  const directCostCodes: string[] =
    Array.isArray(cfgRow?.value?.codes) && cfgRow.value.codes.length
      ? cfgRow.value.codes.map(String)
      : DEFAULT_DIRECT_COST_CODES

  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const currentMon = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const rows = await queryRows<{ mon: string; revenue_cents: string; direct_cost_cents: string }>(
    `SELECT to_char(invoice_date, 'YYYY-MM') AS mon,
            COALESCE(SUM(line_ex_gst_cents) FILTER (WHERE invoice_type = 'ACCREC'), 0)::text AS revenue_cents,
            COALESCE(SUM(line_ex_gst_cents) FILTER (WHERE invoice_type = 'ACCPAY' AND account_code = ANY($2)), 0)::text AS direct_cost_cents
       FROM xero_invoice_lines_cache
      WHERE tenant_id = $1 AND invoice_date >= $3::date
      GROUP BY 1`,
    [tenantId, directCostCodes, fromDate.toISOString().slice(0, 10)],
  )

  const series = buildAgiSeries(
    rows.map(r => ({
      mon: r.mon,
      revenueCents: Number(r.revenue_cents),
      directCostCents: Number(r.direct_cost_cents),
    })),
    { currentMon },
  )

  // Configured Get Out target. NOTE: for an apples-to-apples AGI comparison the
  // target should be OVERHEADS ONLY (direct costs are already netted into AGI).
  // We surface it as-is plus a flag so the UI can prompt for reconfiguration.
  const config = await loadGetOutConfig(tenantId)
  const target = summariseConfig(config).totalCents / 100
  const round2 = (n: number) => Math.round(n * 100) / 100

  // Headline AGI = trailing-3 average (smooths accrual noise), falling back to
  // current month then trailing-12.
  const headlineAgi = series.trailing3.avgAgi || series.current?.agi || series.trailing12.avgAgi || 0

  return {
    currentMon,
    directCostCodes,
    target: round2(target),
    headline: {
      agiTrailing3Avg: series.trailing3.avgAgi,
      agiTrailing12Avg: series.trailing12.avgAgi,
      marginPctTrailing12: series.trailing12.avgMarginPct,
      currentMonthAgi: series.current?.agi ?? null,
      position: round2(headlineAgi - target),
    },
    months: series.months,
    trailing3: series.trailing3,
    trailing12: series.trailing12,
    note: 'AGI = Revenue − Direct Costs (Xero DIRECTCOSTS), from cached line items. Trailing figures exclude the current partial month. Target should be overheads-only for an apples-to-apples comparison.',
  }
})
