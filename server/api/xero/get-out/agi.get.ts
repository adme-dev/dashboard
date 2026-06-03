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

  // Direct-cost codes — prefer Xero account TYPE (DIRECTCOSTS) from the accounts
  // cache; fall back to config override, then the built-in default set.
  const dcRows = await queryRows<{ code: string }>(
    `SELECT code FROM xero_accounts_cache WHERE tenant_id = $1 AND type = 'DIRECTCOSTS'`,
    [tenantId],
  )
  let directCostCodes = dcRows.map(r => r.code)
  let directCostSource = 'xero_type'
  if (!directCostCodes.length) {
    const cfgRow = await queryOne<{ value: any }>(
      `SELECT value FROM agency_settings WHERE tenant_id = $1 AND key = 'direct_cost_account_codes'`,
      [tenantId],
    )
    const cfgCodes = Array.isArray(cfgRow?.value?.codes) ? cfgRow.value.codes.map(String) : []
    directCostCodes = cfgCodes.length ? cfgCodes : DEFAULT_DIRECT_COST_CODES
    directCostSource = cfgCodes.length ? 'config' : 'default'
  }

  // Operating-overhead codes (EXPENSE/OVERHEADS) for a grounded overheads
  // reference — excludes liabilities (GST/PAYG/super payable, director loans).
  const ohRows = await queryRows<{ code: string }>(
    `SELECT code FROM xero_accounts_cache WHERE tenant_id = $1 AND type IN ('EXPENSE','OVERHEADS')`,
    [tenantId],
  )
  const overheadCodes = ohRows.map(r => r.code)

  const now = new Date()
  const fromDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const currentMon = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const rows = await queryRows<{ mon: string; revenue_cents: string; direct_cost_cents: string; overhead_cents: string }>(
    `SELECT to_char(invoice_date, 'YYYY-MM') AS mon,
            COALESCE(SUM(line_ex_gst_cents) FILTER (WHERE invoice_type = 'ACCREC'), 0)::text AS revenue_cents,
            COALESCE(SUM(line_ex_gst_cents) FILTER (WHERE invoice_type = 'ACCPAY' AND account_code = ANY($2)), 0)::text AS direct_cost_cents,
            COALESCE(SUM(line_ex_gst_cents) FILTER (WHERE invoice_type = 'ACCPAY' AND account_code = ANY($4)), 0)::text AS overhead_cents
       FROM xero_invoice_lines_cache
      WHERE tenant_id = $1 AND invoice_date >= $3::date
      GROUP BY 1`,
    [tenantId, directCostCodes, fromDate.toISOString().slice(0, 10), overheadCodes],
  )

  const series = buildAgiSeries(
    rows.map(r => ({
      mon: r.mon,
      revenueCents: Number(r.revenue_cents),
      directCostCents: Number(r.direct_cost_cents),
    })),
    { currentMon },
  )

  // Actual operating overheads (Xero EXPENSE/OVERHEADS), trailing-3 avg over
  // COMPLETE months — a grounded anchor for the overheads-only target. NB:
  // wages/super are payroll (not ACCPAY) so they're NOT in this figure.
  const completeOverheads = rows
    .filter(r => r.mon !== currentMon)
    .sort((a, b) => a.mon.localeCompare(b.mon))
    .slice(-3)
    .map(r => Number(r.overhead_cents) / 100)
  const overheadsActualTrailing3 = completeOverheads.length
    ? Math.round((completeOverheads.reduce((s, x) => s + x, 0) / completeOverheads.length) * 100) / 100
    : 0

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
    directCostSource,
    directCostCodeCount: directCostCodes.length,
    overheadCodeCount: overheadCodes.length,
    overheadsActualTrailing3,
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
