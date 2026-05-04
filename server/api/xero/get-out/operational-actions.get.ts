/**
 * GET /api/xero/get-out/operational-actions
 *
 * Operational sibling of /api/xero/get-out/actions (which is strategic /
 * CFO-flavoured). This one is "what should I do this month, this week,
 * today" — synthesises shortfall-closure plans from the data we already
 * have:
 *
 *   1. Shortfall closure plan — if behind target, recipe to close the gap:
 *      "send invoice to X, convert sent quote Y, chase overdue Z"
 *   2. Stuck sent quote — sat in 'sent' state too long, likely needs a nudge
 *   3. Overdue chase priority — biggest overdue × likelihood-of-paying
 *   4. Recurring not yet fired — past typical invoicing day with no invoice
 *   5. Pace ahead/behind heads-up — early warning before EOM
 *
 * Output ranked by severity and capped at 8.
 */

import { defineEventHandler, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { xeroFetch } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
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
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  // Pull this-month invoiced and target so we know the gap.
  const totals = await queryOne<{ invoiced_cents: string }>(
    `SELECT COALESCE(SUM(total_cents), 0)::text AS invoiced_cents
       FROM xero_invoices_cache
       WHERE tenant_id = $1
         AND type = 'ACCREC'
         AND status NOT IN ('VOIDED','DRAFT','DELETED')
         AND date BETWEEN $2::date AND $3::date`,
    [tenantId, monthStart, monthEnd],
  )
  const invoiced = n(totals?.invoiced_cents) / 100
  const cfg = await loadGetOutConfig(tenantId)
  const target = summariseConfig(cfg).totalCents / 100
  const shortfall = Math.max(0, target - invoiced)

  // Working days remaining (Mon-Fri only) — drives "$/day required" math.
  let workingDaysRemaining = 0
  for (let d = dayOfMonth + 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay()
    if (dow !== 0 && dow !== 6) workingDaysRemaining++
  }

  // ── 1. Shortfall heads-up + closure recipe ─────────────────────────
  if (shortfall > 0) {
    const requiredPerWorkingDay = workingDaysRemaining > 0
      ? shortfall / workingDaysRemaining
      : shortfall
    const sev: Severity = workingDaysRemaining <= 3 && shortfall > 0
      ? 'critical'
      : workingDaysRemaining <= 7
        ? 'high'
        : 'medium'
    actions.push({
      id: 'shortfall',
      severity: sev,
      title: `${fmtAUD(shortfall)} short of monthly target`,
      detail: `${workingDaysRemaining} working days left — need ${fmtAUD(requiredPerWorkingDay)}/day to hit ${fmtAUD(target)}.`,
      value: fmtAUD(shortfall),
    })
  }

  // ── 2. Stuck sent quotes (live) ────────────────────────────────────
  // A sent quote sitting > 14 days is the easiest "follow up" lever.
  try {
    const body = await xeroFetch<any>({
      accessToken: token.access_token!,
      tenantId,
      path: 'Quotes?order=Date DESC',
    })
    const stuck: Array<{ name: string; total: number; days: number }> = []
    for (const q of (body?.quotes ?? [])) {
      if (String(q.status ?? '').toUpperCase() !== 'SENT') continue
      const dateStr = q.date ? String(q.date).slice(0, 10) : null
      if (!dateStr) continue
      const days = Math.floor((today.getTime() - new Date(dateStr).getTime()) / 86_400_000)
      if (days < 14) continue
      stuck.push({ name: q.contact?.name ?? 'Unknown', total: n(q.total), days })
    }
    if (stuck.length > 0) {
      stuck.sort((a, b) => b.total - a.total)
      const biggest = stuck[0]!
      const rest = stuck.slice(1)
      actions.push({
        id: 'quote-stuck',
        severity: stuck.length >= 3 ? 'high' : 'medium',
        title: `Follow up ${stuck.length} stuck quote${stuck.length === 1 ? '' : 's'}`,
        detail: `Biggest: ${biggest.name} (${fmtAUD(biggest.total)}) sat ${biggest.days}d in 'sent'. ${rest.length > 0 ? `Plus ${rest.length} more totalling ${fmtAUD(rest.reduce((s, x) => s + x.total, 0))}.` : ''}`,
        value: fmtAUD(stuck.reduce((s, x) => s + x.total, 0)),
      })
    }
  } catch (err: any) {
    console.warn('[operational-actions] quotes fetch failed:', err?.statusMessage ?? err?.message)
  }

  // ── 3. Overdue chase priority ──────────────────────────────────────
  // Highest-leverage chase = biggest single overdue, weighted by recency.
  const topOverdue = await queryRows<{
    name: string | null
    overdue_cents: string
    oldest_overdue_days: number
    paid_late_pct: string | null
    dso_days: string | null
  }>(
    `SELECT c.name,
            r.overdue_cents::text         AS overdue_cents,
            r.oldest_overdue_days,
            r.paid_late_pct::text         AS paid_late_pct,
            r.dso_days::text              AS dso_days
       FROM xero_customer_rollups r
       JOIN xero_contacts_cache c
         ON c.tenant_id = r.tenant_id AND c.contact_id = r.contact_id
       WHERE r.tenant_id = $1 AND r.overdue_cents > 0
       ORDER BY r.overdue_cents DESC
       LIMIT 3`,
    [tenantId],
  )
  if (topOverdue.length > 0) {
    const top = topOverdue[0]!
    const overdue = n(top.overdue_cents) / 100
    const days = top.oldest_overdue_days
    const dso = top.dso_days != null ? Math.round(Number(top.dso_days)) : null
    actions.push({
      id: 'chase-top',
      severity: days >= 60 ? 'high' : 'medium',
      title: `Chase ${top.name ?? 'top overdue'} for ${fmtAUD(overdue)}`,
      detail: `${days} days past due${dso != null ? ` · usually pays in ${dso} days when chased` : ''}.`,
      value: fmtAUD(overdue),
    })
  }

  // ── 4. Recurring not yet fired ─────────────────────────────────────
  // Inferred-MRR contacts who historically invoice by day-of-month X but
  // haven't yet this month. Past their typical invoicing day → flag.
  const missing = await queryRows<{
    name: string | null
    inferred_mrr_cents: string
    last_invoice_day: number | null
    contact_count: string
  }>(
    `WITH this_month AS (
       SELECT contact_id,
              MAX(EXTRACT(DAY FROM date)::int) AS last_invoice_day
         FROM xero_invoices_cache
         WHERE tenant_id = $1
           AND type = 'ACCREC'
           AND status NOT IN ('VOIDED','DRAFT','DELETED')
           AND date BETWEEN $2::date AND $3::date
         GROUP BY contact_id
     ),
     historical AS (
       SELECT contact_id,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM date)::int)::int AS typical_day
         FROM xero_invoices_cache
         WHERE tenant_id = $1
           AND type = 'ACCREC'
           AND status NOT IN ('VOIDED','DRAFT','DELETED')
           AND date >= (CURRENT_DATE - INTERVAL '4 months')::date
           AND date <  DATE_TRUNC('month', CURRENT_DATE)::date
         GROUP BY contact_id
     )
     SELECT c.name,
            r.inferred_mrr_cents::text AS inferred_mrr_cents,
            COALESCE(h.typical_day, 28)::int AS last_invoice_day,
            (SELECT COUNT(*)::text FROM xero_customer_rollups r2
               LEFT JOIN this_month tm USING (contact_id)
               LEFT JOIN historical h2 USING (contact_id)
               WHERE r2.tenant_id = $1
                 AND r2.inferred_mrr_cents > 0
                 AND r2.inferred_mrr_confidence IN ('high','medium')
                 AND tm.last_invoice_day IS NULL
                 AND $4::int > COALESCE(h2.typical_day, 28)
            ) AS contact_count
       FROM xero_customer_rollups r
       LEFT JOIN xero_contacts_cache c ON c.tenant_id = r.tenant_id AND c.contact_id = r.contact_id
       LEFT JOIN this_month tm ON tm.contact_id = r.contact_id
       LEFT JOIN historical h ON h.contact_id = r.contact_id
       WHERE r.tenant_id = $1
         AND r.inferred_mrr_cents > 0
         AND r.inferred_mrr_confidence IN ('high','medium')
         AND tm.last_invoice_day IS NULL
         AND $4::int > COALESCE(h.typical_day, 28)
       ORDER BY r.inferred_mrr_cents DESC
       LIMIT 5`,
    [tenantId, monthStart, monthEnd, dayOfMonth],
  )
  if (missing.length > 0) {
    const totalMissing = missing.reduce((s, m) => s + n(m.inferred_mrr_cents) / 100, 0)
    const top = missing[0]!
    const expected = top.last_invoice_day ?? 28
    actions.push({
      id: 'recurring-missing',
      severity: 'high',
      title: `${missing.length} retainer${missing.length === 1 ? '' : 's'} haven't invoiced yet`,
      detail: `${top.name ?? 'Top'} usually invoices by day ${expected}. Total expected: ${fmtAUD(totalMissing)}.`,
      value: fmtAUD(totalMissing),
    })
  }

  // ── 5. Surplus (already past target) ───────────────────────────────
  if (shortfall === 0 && invoiced > target) {
    const overshoot = invoiced - target
    actions.push({
      id: 'surplus',
      severity: 'low',
      title: `${fmtAUD(overshoot)} above target`,
      detail: `Past Get Out for ${month}/${year}. Bank the surplus or pull forward investment plans.`,
      value: fmtAUD(overshoot),
    })
  }

  actions.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  return {
    generatedAt: new Date().toISOString(),
    period: { monthStart, monthEnd, dayOfMonth, daysInMonth, workingDaysRemaining },
    target: Math.round(target * 100) / 100,
    invoiced: Math.round(invoiced * 100) / 100,
    shortfall: Math.round(shortfall * 100) / 100,
    actions: actions.slice(0, 8),
  }
})
