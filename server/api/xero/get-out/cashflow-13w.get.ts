/**
 * GET /api/xero/get-out/cashflow-13w
 *
 * 13-week rolling cashflow forecast. The standard banker / accountant
 * view: combines AR (cash in) + AP (cash out) bucketed by week.
 *
 * Buckets relative to today (week 0 = current week, week 12 = ~3 months out).
 * Reads from xero_invoices_cache for both ACCREC (inflows) and ACCPAY
 * (outflows). Adds opening cash from bank_summary so the chart reads as
 * a true running balance.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { extractCurrentCash, fetchBankSummary } from '~~/server/utils/xeroDataFetcher'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'

interface InvoiceWeekRow {
  week_start: string
  type: 'ACCREC' | 'ACCPAY'
  amount_due_cents: string | number
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantIdRaw = await getSelectedTenant(event)
  if (!tenantIdRaw) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })
  const tenantId = tenantIdRaw

  const today = new Date()
  // Week starts on Monday — DATE_TRUNC('week', ...) is Mon by default in PG
  const weekStart = new Date(today)
  weekStart.setHours(0, 0, 0, 0)
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))  // back to Monday
  const horizonEnd = new Date(weekStart.getTime() + 13 * 7 * 86400_000)

  const startStr = weekStart.toISOString().slice(0, 10)
  const endStr = horizonEnd.toISOString().slice(0, 10)

  // Per-week, per-type sums of amount_due (what we expect to actually move)
  const rows = await queryRows<InvoiceWeekRow>(
    `SELECT
       TO_CHAR(DATE_TRUNC('week', due_date), 'YYYY-MM-DD') AS week_start,
       type,
       SUM(amount_due_cents)::text AS amount_due_cents
     FROM xero_invoices_cache
     WHERE tenant_id = $1
       AND status = 'AUTHORISED'
       AND amount_due_cents > 0
       AND due_date BETWEEN $2::date AND $3::date
     GROUP BY DATE_TRUNC('week', due_date), type
     ORDER BY week_start`,
    [tenantId, startStr, endStr],
  )

  // Opening cash (live Xero — balance is current as of today)
  let openingCash = 0
  try {
    const bank = await fetchBankSummary(token.access_token!, tenantId)
    openingCash = extractCurrentCash(bank)
  } catch (err: any) {
    console.warn('[cashflow-13w] bank summary failed:', err?.message)
  }

  // Projection inputs:
  //  • Inferred MRR (high + medium-confidence weighted) → projected monthly inflow.
  //    Excludes contacts already counted via Xero RepeatingInvoices to avoid
  //    double-billing. "Low" confidence is skipped — too noisy for a forecast.
  //  • Monthly operating commitment from getOutConfig → projected weekly outflow.
  const inferredRow = await queryOne<{ projected_monthly_cents: string; high_cents: string; medium_cents: string }>(
    `SELECT
       COALESCE(SUM(CASE inferred_mrr_confidence
         WHEN 'high'   THEN inferred_mrr_cents
         WHEN 'medium' THEN (inferred_mrr_cents * 0.85)::bigint
         ELSE 0 END), 0)::text AS projected_monthly_cents,
       COALESCE(SUM(CASE WHEN inferred_mrr_confidence='high'   THEN inferred_mrr_cents END), 0)::text AS high_cents,
       COALESCE(SUM(CASE WHEN inferred_mrr_confidence='medium' THEN inferred_mrr_cents END), 0)::text AS medium_cents
     FROM xero_customer_rollups
     WHERE tenant_id = $1
       AND NOT has_active_repeating`,
    [tenantId],
  )
  const monthlyProjectedInflow = n(inferredRow?.projected_monthly_cents) / 100
  const config = await loadGetOutConfig(tenantId)
  const monthlyBurn = summariseConfig(config).totalCents / 100
  // 12 months ÷ 52 weeks = average weeks per month. Spreads burn evenly.
  const weeklyBurn = monthlyBurn * 12 / 52

  // Build 13 weeks (known AR/AP first; projections layered on after)
  type Bucket = {
    weekStart: string
    weekLabel: string
    inflow: number
    outflow: number
    net: number
    runningBalance: number
    inflowProjected: number
    outflowProjected: number
    netProjected: number
    runningBalanceProjected: number
  }
  const buckets: Bucket[] = []

  let running = openingCash
  for (let w = 0; w < 13; w++) {
    const wkStart = new Date(weekStart.getTime() + w * 7 * 86400_000)
    const wkStartStr = wkStart.toISOString().slice(0, 10)
    const wkLabel = `W${w} ${wkStart.toLocaleString('en-AU', { month: 'short', day: 'numeric' })}`
    const matchInflow = rows.find(r => String(r.week_start).startsWith(wkStartStr.slice(0, 10)) && r.type === 'ACCREC')
    const matchOutflow = rows.find(r => String(r.week_start).startsWith(wkStartStr.slice(0, 10)) && r.type === 'ACCPAY')
    const inflow = n(matchInflow?.amount_due_cents) / 100
    const outflow = n(matchOutflow?.amount_due_cents) / 100
    const net = inflow - outflow
    running += net
    buckets.push({
      weekStart: wkStartStr,
      weekLabel: wkLabel,
      inflow: Math.round(inflow * 100) / 100,
      outflow: Math.round(outflow * 100) / 100,
      net: Math.round(net * 100) / 100,
      runningBalance: Math.round(running * 100) / 100,
      inflowProjected: 0,
      outflowProjected: 0,
      netProjected: 0,
      runningBalanceProjected: 0,
    })
  }

  // Sum known AR by calendar month so projection only fills the gap.
  const knownArByMonth = new Map<string, number>()
  for (const b of buckets) {
    const mKey = b.weekStart.slice(0, 7)
    knownArByMonth.set(mKey, (knownArByMonth.get(mKey) ?? 0) + b.inflow)
  }

  // Layer projection: weekly burn outflow on every bucket, projected MRR
  // inflow on the first week of each month within horizon (matches the
  // observed Net-7 payment pattern for end-of-month invoicing).
  let runningProjected = openingCash
  let totalInflowProjected = 0
  let totalOutflowProjected = 0
  for (const b of buckets) {
    b.outflowProjected = Math.round(weeklyBurn * 100) / 100
    totalOutflowProjected += b.outflowProjected

    const dayOfMonth = new Date(b.weekStart + 'T00:00:00Z').getUTCDate()
    if (dayOfMonth <= 7) {
      const mKey = b.weekStart.slice(0, 7)
      const knownAR = knownArByMonth.get(mKey) ?? 0
      const gap = Math.max(0, monthlyProjectedInflow - knownAR)
      b.inflowProjected = Math.round(gap * 100) / 100
      totalInflowProjected += b.inflowProjected
    }

    const netProj = b.inflow + b.inflowProjected - b.outflow - b.outflowProjected
    runningProjected += netProj
    b.netProjected = Math.round(netProj * 100) / 100
    b.runningBalanceProjected = Math.round(runningProjected * 100) / 100
  }

  const totalInflow = buckets.reduce((s, b) => s + b.inflow, 0)
  const totalOutflow = buckets.reduce((s, b) => s + b.outflow, 0)
  const closingBalance = running
  const closingBalanceProjected = runningProjected
  const lowestBalance = Math.min(...buckets.map(b => b.runningBalance), openingCash)
  const lowestBalanceWeek = buckets.find(b => b.runningBalance === lowestBalance)?.weekLabel ?? null
  const lowestBalanceProjected = Math.min(
    ...buckets.map(b => b.runningBalanceProjected),
    openingCash,
  )
  const lowestBalanceProjectedWeek = buckets.find(b => b.runningBalanceProjected === lowestBalanceProjected)?.weekLabel ?? null

  return {
    openingCash: Math.round(openingCash * 100) / 100,
    closingBalance: Math.round(closingBalance * 100) / 100,
    closingBalanceProjected: Math.round(closingBalanceProjected * 100) / 100,
    totalInflow: Math.round(totalInflow * 100) / 100,
    totalOutflow: Math.round(totalOutflow * 100) / 100,
    totalInflowProjected: Math.round(totalInflowProjected * 100) / 100,
    totalOutflowProjected: Math.round(totalOutflowProjected * 100) / 100,
    netChange: Math.round((closingBalance - openingCash) * 100) / 100,
    netChangeProjected: Math.round((closingBalanceProjected - openingCash) * 100) / 100,
    lowestBalance: Math.round(lowestBalance * 100) / 100,
    lowestBalanceWeek,
    lowestBalanceProjected: Math.round(lowestBalanceProjected * 100) / 100,
    lowestBalanceProjectedWeek,
    buckets,
    projectionInputs: {
      monthlyProjectedInflow: Math.round(monthlyProjectedInflow * 100) / 100,
      monthlyBurn: Math.round(monthlyBurn * 100) / 100,
      weeklyBurn: Math.round(weeklyBurn * 100) / 100,
      highMrr: Math.round(n(inferredRow?.high_cents) / 100 * 100) / 100,
      mediumMrr: Math.round(n(inferredRow?.medium_cents) / 100 * 100) / 100,
    },
  }
})
