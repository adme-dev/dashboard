/**
 * GET /api/xero/get-out/efficiency
 *
 * Per-head economics + DSO trend — the productivity numbers a CFO checks
 * to know whether the cost base is staying ahead of the team.
 *
 * Returns:
 *   revenuePerHead       — YTD revenue ÷ billable team size
 *   revenuePerHeadAnnualised — run-rate / team size (industry: $150-250k)
 *   costPerHead          — monthly burn × 12 ÷ team size
 *   profitPerHead        — (revenue run-rate − cost run-rate) ÷ team size
 *   dsoCurrent           — weighted DSO over last 90 days of paid invoices
 *   dsoPrior             — same metric for prior 90 days
 *   dsoDelta             — current − prior (positive = slowing payments)
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  const today = new Date()
  const yearStart = `${today.getFullYear()}-01-01`
  const todayStr = today.toISOString().slice(0, 10)
  const dayOfYear = Math.floor((today.getTime() - new Date(yearStart).getTime()) / 86_400_000) + 1
  const totalDaysInYear = ((today.getFullYear() % 4 === 0 && today.getFullYear() % 100 !== 0) || today.getFullYear() % 400 === 0) ? 366 : 365

  // Active billable team (mirrors utilization endpoint)
  const team = await queryOne<{ team_size: string }>(
    `SELECT COUNT(*)::text AS team_size
       FROM team_members
       WHERE is_active = true
         AND (target_utilization IS NULL OR target_utilization > 0)`,
  )
  const billableTeamSize = Number(team?.team_size ?? 0)

  // YTD revenue
  const ytdRow = await queryOne<{ ytd_cents: string }>(
    `SELECT COALESCE(SUM(total_cents), 0)::text AS ytd_cents
       FROM xero_invoices_cache
       WHERE tenant_id = $1
         AND type = 'ACCREC'
         AND status NOT IN ('VOIDED','DRAFT','DELETED')
         AND date BETWEEN $2::date AND $3::date`,
    [tenantId, yearStart, todayStr],
  )
  const ytdRevenue = n(ytdRow?.ytd_cents) / 100
  const annualRevenueRunRate = dayOfYear > 0 ? (ytdRevenue / dayOfYear) * totalDaysInYear : 0

  // Annual cost base (monthly burn × 12)
  const config = await loadGetOutConfig(tenantId)
  const monthlyBurn = summariseConfig(config).totalCents / 100
  const annualCost = monthlyBurn * 12

  const revenuePerHead         = billableTeamSize > 0 ? ytdRevenue / billableTeamSize : 0
  const revenuePerHeadAnnualised = billableTeamSize > 0 ? annualRevenueRunRate / billableTeamSize : 0
  const costPerHead            = billableTeamSize > 0 ? annualCost / billableTeamSize : 0
  const profitPerHead          = billableTeamSize > 0 ? (annualRevenueRunRate - annualCost) / billableTeamSize : 0

  // Industry benchmarks (agency, AUD): $150k = low, $200k healthy, $250k+ strong.
  let revPerHeadBand: 'low' | 'healthy' | 'strong'
  if (revenuePerHeadAnnualised < 150_000) revPerHeadBand = 'low'
  else if (revenuePerHeadAnnualised < 200_000) revPerHeadBand = 'healthy'
  else revPerHeadBand = 'strong'

  // DSO trend: average (paid_date - invoice_date) weighted by invoice value.
  // Last 90 days of PAID invoices vs the prior 90 days.
  const dsoRow = await queryOne<{
    current_dso: string | null
    current_count: string
    prior_dso: string | null
    prior_count: string
  }>(
    `WITH paid AS (
       SELECT
         (fully_paid_on_date - date)::int AS days_to_pay,
         total_cents,
         fully_paid_on_date
       FROM xero_invoices_cache
       WHERE tenant_id = $1
         AND type = 'ACCREC'
         AND status = 'PAID'
         AND fully_paid_on_date IS NOT NULL
         AND fully_paid_on_date >= (CURRENT_DATE - INTERVAL '180 days')::date
     )
     SELECT
       (CASE WHEN SUM(total_cents) FILTER (WHERE fully_paid_on_date >= (CURRENT_DATE - INTERVAL '90 days')::date) > 0
             THEN (SUM(days_to_pay::numeric * total_cents) FILTER (WHERE fully_paid_on_date >= (CURRENT_DATE - INTERVAL '90 days')::date)
                   / SUM(total_cents) FILTER (WHERE fully_paid_on_date >= (CURRENT_DATE - INTERVAL '90 days')::date))::text
             ELSE NULL END) AS current_dso,
       COUNT(*) FILTER (WHERE fully_paid_on_date >= (CURRENT_DATE - INTERVAL '90 days')::date)::text AS current_count,
       (CASE WHEN SUM(total_cents) FILTER (WHERE fully_paid_on_date < (CURRENT_DATE - INTERVAL '90 days')::date) > 0
             THEN (SUM(days_to_pay::numeric * total_cents) FILTER (WHERE fully_paid_on_date < (CURRENT_DATE - INTERVAL '90 days')::date)
                   / SUM(total_cents) FILTER (WHERE fully_paid_on_date < (CURRENT_DATE - INTERVAL '90 days')::date))::text
             ELSE NULL END) AS prior_dso,
       COUNT(*) FILTER (WHERE fully_paid_on_date < (CURRENT_DATE - INTERVAL '90 days')::date)::text AS prior_count
       FROM paid`,
    [tenantId],
  )
  const dsoCurrent = dsoRow?.current_dso != null ? Math.round(Number(dsoRow.current_dso) * 10) / 10 : null
  const dsoPrior   = dsoRow?.prior_dso   != null ? Math.round(Number(dsoRow.prior_dso)   * 10) / 10 : null
  const dsoDelta   = dsoCurrent != null && dsoPrior != null
    ? Math.round((dsoCurrent - dsoPrior) * 10) / 10
    : null

  return {
    billableTeamSize,
    revenuePerHead:           Math.round(revenuePerHead * 100) / 100,
    revenuePerHeadAnnualised: Math.round(revenuePerHeadAnnualised * 100) / 100,
    costPerHead:              Math.round(costPerHead * 100) / 100,
    profitPerHead:            Math.round(profitPerHead * 100) / 100,
    revPerHeadBand,
    annualRevenueRunRate:     Math.round(annualRevenueRunRate * 100) / 100,
    annualCost:               Math.round(annualCost * 100) / 100,
    dso: {
      current: dsoCurrent,
      prior:   dsoPrior,
      delta:   dsoDelta,
      currentInvoiceCount: Number(dsoRow?.current_count ?? 0),
      priorInvoiceCount:   Number(dsoRow?.prior_count   ?? 0),
    },
  }
})
