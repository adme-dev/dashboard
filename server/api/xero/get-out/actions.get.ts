/**
 * GET /api/xero/get-out/actions
 *
 * "What should I do this week?" — pure synthesizer over the rest of the
 * get-out endpoints. No new data sources; just heuristics that read the
 * same rollups, config, and invoice cache the other cards already use,
 * then rank the most material things to act on.
 *
 * Each action has:
 *   id       — stable string for de-dup / dismissal later
 *   severity — critical | high | medium | low (drives card colour + sort)
 *   title    — short imperative ("Chase $X overdue from Client Y")
 *   detail   — one-line reasoning
 *   value    — quantified impact (dollars or pct)
 *   linkTo   — deep-link the user can click to act
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { extractCurrentCash, fetchBankSummary } from '~~/server/utils/xeroDataFetcher'
import { loadGetOutConfig, summariseConfig } from '~~/server/utils/getOutConfig'

type Severity = 'critical' | 'high' | 'medium' | 'low'

interface Action {
  id: string
  severity: Severity
  title: string
  detail: string
  value: string
  linkTo?: string
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}
function fmtAUD(v: number): string {
  return v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Not authenticated with Xero' })

  const actions: Action[] = []

  // ── 1. Top overdue chase ───────────────────────────────────────────
  // Biggest single-account collection win, scoped to anything ≥ 30 days old.
  const topOverdue = await queryOne<{
    name: string | null
    overdue_cents: string
    oldest_overdue_days: number
  }>(
    `SELECT c.name,
            r.overdue_cents::text     AS overdue_cents,
            r.oldest_overdue_days
       FROM xero_customer_rollups r
       JOIN xero_contacts_cache c
         ON c.tenant_id = r.tenant_id AND c.contact_id = r.contact_id
       WHERE r.tenant_id = $1
         AND r.overdue_cents > 0
         AND r.oldest_overdue_days >= 30
       ORDER BY r.overdue_cents DESC
       LIMIT 1`,
    [tenantId],
  )
  if (topOverdue) {
    const overdue = n(topOverdue.overdue_cents) / 100
    const days = topOverdue.oldest_overdue_days
    const sev: Severity = days >= 90 ? 'critical' : days >= 60 ? 'high' : 'medium'
    actions.push({
      id: 'overdue-top',
      severity: sev,
      title: `Chase ${fmtAUD(overdue)} overdue from ${topOverdue.name ?? 'top account'}`,
      detail: `Oldest unpaid invoice is ${days} days past due — biggest single-account collection win.`,
      value: fmtAUD(overdue),
      linkTo: '/xeroflow/cfo',
    })
  }

  // ── 2. Stale annual goal ───────────────────────────────────────────
  const today = new Date()
  const yearStart = `${today.getFullYear()}-01-01`
  const todayStr = today.toISOString().slice(0, 10)
  const yearStartTs = new Date(yearStart).getTime()
  const totalDays = Math.floor((new Date(`${today.getFullYear()}-12-31`).getTime() - yearStartTs) / 86_400_000) + 1
  const daysIn = Math.max(0, Math.floor((today.getTime() - yearStartTs) / 86_400_000) + 1)
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
  const goalRow = await queryOne<{ value: { goalCents?: number } }>(
    `SELECT value FROM agency_settings WHERE tenant_id = $1 AND key = 'annual_revenue_goal'`,
    [tenantId],
  )
  let annualGoal = goalRow?.value?.goalCents ? goalRow.value.goalCents / 100 : 0
  if (!annualGoal) {
    const cfg = await loadGetOutConfig(tenantId)
    annualGoal = (summariseConfig(cfg).totalCents / 100) * 12
  }
  const projected = daysIn > 0 ? (ytdRevenue / daysIn) * totalDays : 0
  if (annualGoal > 0 && daysIn >= 60 && (projected / annualGoal > 1.5 || projected / annualGoal < 0.5)) {
    const ratio = projected / annualGoal
    actions.push({
      id: 'goal-stale',
      severity: 'high',
      title: 'Re-baseline annual goal',
      detail: `You're tracking to ${fmtAUD(projected)} against a ${fmtAUD(annualGoal)} goal — a ${Math.round(ratio * 100)}% pace. Pipeline coverage and pace metrics aren't useful at this gap.`,
      value: `${Math.round(ratio * 100)}% of goal`,
      linkTo: '/xeroflow/get-out',
    })
  }

  // ── 3. MRR contraction / churn flag ────────────────────────────────
  const mrrRow = await queryOne<{
    contraction_cents: string
    churned_cents: string
    contraction_count: string
    churned_count: string
  }>(
    `WITH monthly AS (
       SELECT contact_id, DATE_TRUNC('month', date)::date AS month, SUM(total_cents)::bigint AS month_cents
         FROM xero_invoices_cache
         WHERE tenant_id = $1 AND type = 'ACCREC'
           AND status NOT IN ('VOIDED','DRAFT','DELETED')
           AND date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '4 months')::date
           AND date <  DATE_TRUNC('month', CURRENT_DATE)::date
         GROUP BY contact_id, DATE_TRUNC('month', date)
     ),
     flat AS (
       SELECT contact_id,
         SUM(CASE WHEN month = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::date THEN month_cents END) AS last_month,
         SUM(CASE WHEN month = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months')::date THEN month_cents END) AS prior_month,
         SUM(CASE WHEN month = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months')::date THEN month_cents END) AS two_back
       FROM monthly GROUP BY contact_id
     )
     SELECT
       COALESCE(SUM(prior_month - COALESCE(last_month,0)) FILTER (
         WHERE COALESCE(last_month,0) > 0 AND COALESCE(prior_month,0) > 0 AND last_month < prior_month * 0.90), 0)::text AS contraction_cents,
       COALESCE(SUM(prior_month) FILTER (
         WHERE COALESCE(last_month,0) = 0 AND COALESCE(prior_month,0) > 0 AND COALESCE(two_back,0) > 0), 0)::text AS churned_cents,
       COUNT(*) FILTER (
         WHERE COALESCE(last_month,0) > 0 AND COALESCE(prior_month,0) > 0 AND last_month < prior_month * 0.90)::text AS contraction_count,
       COUNT(*) FILTER (
         WHERE COALESCE(last_month,0) = 0 AND COALESCE(prior_month,0) > 0 AND COALESCE(two_back,0) > 0)::text AS churned_count
       FROM flat`,
    [tenantId],
  )
  const churnedCents = n(mrrRow?.churned_cents)
  const contractionCents = n(mrrRow?.contraction_cents)
  const churnedCount = Number(mrrRow?.churned_count ?? 0)
  const contractionCount = Number(mrrRow?.contraction_count ?? 0)
  if (churnedCount > 0) {
    actions.push({
      id: 'mrr-churn',
      severity: churnedCount >= 3 ? 'high' : 'medium',
      title: `${churnedCount} client${churnedCount === 1 ? '' : 's'} stopped invoicing last month`,
      detail: `Lost ${fmtAUD(churnedCents / 100)} of recurring billing vs the prior month. Chase or write off — don't let them sit ambiguous.`,
      value: fmtAUD(churnedCents / 100),
    })
  }
  if (contractionCount >= 5 && contractionCents / 100 > 5_000) {
    actions.push({
      id: 'mrr-contraction',
      severity: contractionCount >= 10 ? 'high' : 'medium',
      title: `${contractionCount} clients shrank vs prior month`,
      detail: `Net contraction of ${fmtAUD(contractionCents / 100)}. Could be one-off project rollover or genuine downscoping — review the top movers.`,
      value: fmtAUD(contractionCents / 100),
    })
  }

  // ── 4. Concentration risk ──────────────────────────────────────────
  const concRow = await queryOne<{ top1_pct: string }>(
    `SELECT MAX(concentration_pct)::text AS top1_pct
       FROM xero_customer_rollups
       WHERE tenant_id = $1`,
    [tenantId],
  )
  const top1 = Number(concRow?.top1_pct ?? 0)
  if (top1 >= 25) {
    actions.push({
      id: 'concentration',
      severity: top1 >= 40 ? 'critical' : 'high',
      title: 'Concentration risk on biggest client',
      detail: `Top client = ${top1.toFixed(1)}% of YTD revenue. If they churned, you'd lose ${top1.toFixed(0)}% of your topline. Diversify or lock in via retainer.`,
      value: `${top1.toFixed(1)}%`,
    })
  }

  // ── 5. Cash runway ─────────────────────────────────────────────────
  let currentCash = 0
  try {
    const bank = await fetchBankSummary(token.access_token!, tenantId)
    currentCash = extractCurrentCash(bank)
  } catch (err: any) {
    console.warn('[actions] bank summary failed:', err?.message)
  }
  const cfg = await loadGetOutConfig(tenantId)
  const monthlyBurn = summariseConfig(cfg).totalCents / 100
  const inferredRow = await queryOne<{ projected_monthly_cents: string }>(
    `SELECT COALESCE(SUM(CASE inferred_mrr_confidence
       WHEN 'high'   THEN inferred_mrr_cents
       WHEN 'medium' THEN (inferred_mrr_cents * 0.85)::bigint
       ELSE 0 END), 0)::text AS projected_monthly_cents
       FROM xero_customer_rollups
       WHERE tenant_id = $1 AND NOT has_active_repeating`,
    [tenantId],
  )
  const monthlyInflow = n(inferredRow?.projected_monthly_cents) / 100
  const netBurn = monthlyBurn - monthlyInflow
  if (currentCash < 0) {
    actions.push({
      id: 'cash-negative',
      severity: 'critical',
      title: 'Bank balance is negative',
      detail: `Currently ${fmtAUD(currentCash)} in the bank. Don't let this sit through the next payroll run.`,
      value: fmtAUD(currentCash),
    })
  } else if (netBurn > 0 && currentCash > 0 && currentCash / netBurn < 1.5) {
    actions.push({
      id: 'runway-low',
      severity: 'critical',
      title: 'Less than 6 weeks runway',
      detail: `${fmtAUD(currentCash)} cash ÷ ${fmtAUD(netBurn)}/mo net burn = ${(currentCash / netBurn).toFixed(1)} months. Accelerate collections or trim burn now.`,
      value: `${(currentCash / netBurn).toFixed(1)} mo`,
    })
  }

  // ── 6. Pipeline coverage gap (recurring-only check) ────────────────
  // Skips the live Xero Quotes call to keep this endpoint cheap. Only
  // fires when the inferred-recurring-only quarterly is itself short of
  // target — a real "you don't have enough recurring book to make it"
  // signal. Live quote contribution is folded in by pipeline-coverage card.
  if (!actions.find(a => a.id === 'goal-stale')) {
    const monthlyTarget = summariseConfig(cfg).totalCents / 100
    const quarterlyTarget = monthlyTarget * 3
    if (quarterlyTarget > 0) {
      const inferredQ = await queryOne<{ q_cents: string }>(
        `SELECT COALESCE(SUM(CASE inferred_mrr_confidence
           WHEN 'high'   THEN inferred_mrr_cents
           WHEN 'medium' THEN (inferred_mrr_cents * 0.85)::bigint
           WHEN 'low'    THEN (inferred_mrr_cents * 0.6)::bigint
           ELSE 0 END), 0)::text AS q_cents
           FROM xero_customer_rollups
           WHERE tenant_id = $1 AND NOT has_active_repeating`,
        [tenantId],
      )
      const recurringQuarterlyContribution = (n(inferredQ?.q_cents) / 100) * 3
      const recurringCoverage = recurringQuarterlyContribution / quarterlyTarget
      if (recurringCoverage < 0.7) {
        actions.push({
          id: 'pipeline-recurring-gap',
          severity: recurringCoverage < 0.4 ? 'high' : 'medium',
          title: 'Recurring book covers less than 70% of quarterly target',
          detail: `${fmtAUD(recurringQuarterlyContribution)} of recurring × 3mo vs ${fmtAUD(quarterlyTarget)} target. The rest needs to come from quotes/projects — keep an eye on quote close rate.`,
          value: `${(recurringCoverage * 100).toFixed(0)}%`,
        })
      }
    }
  }

  // ── 7. Utilization signal ──────────────────────────────────────────
  const utilRow = await queryOne<{ avg_util: string | null }>(
    `WITH last_completed_month AS (
       SELECT
         SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END) AS billable,
         (SELECT COUNT(*) FROM team_members WHERE is_active AND (target_utilization IS NULL OR target_utilization > 0))::numeric * 21 * 7.5 AS available
         FROM time_entries te
         WHERE te.date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::date
           AND te.date <  DATE_TRUNC('month', CURRENT_DATE)::date
     )
     SELECT (CASE WHEN available > 0 THEN ROUND((billable / available * 100)::numeric, 1) ELSE NULL END)::text AS avg_util
       FROM last_completed_month`,
  )
  const lastMonthUtil = utilRow?.avg_util != null ? Number(utilRow.avg_util) : null
  if (lastMonthUtil != null && lastMonthUtil >= 85) {
    actions.push({
      id: 'util-high',
      severity: 'high',
      title: 'Utilization above 85% last month',
      detail: `${lastMonthUtil}% billable utilization. You're at capacity — start hiring conversations or push back on new work.`,
      value: `${lastMonthUtil}%`,
    })
  } else if (lastMonthUtil != null && lastMonthUtil < 50 && lastMonthUtil > 0) {
    actions.push({
      id: 'util-low',
      severity: 'medium',
      title: 'Utilization below 50% last month',
      detail: `${lastMonthUtil}% billable utilization. Either time logging is incomplete or you have real slack — investigate before it shows up in margins.`,
      value: `${lastMonthUtil}%`,
    })
  }

  // ── Sort by severity, cap at 6 ─────────────────────────────────────
  actions.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  return {
    generatedAt: new Date().toISOString(),
    actions: actions.slice(0, 6),
  }
})
