/**
 * Recommendation generators — pure tenant-scoped runners.
 *
 * Eight generators produce rows in the `recommendations` table:
 *  - runCollectionsGenerator     (Xero — scans AR, category 'collections')
 *  - runAdPacingGenerator        (DB — media_spend, 'cost-control')
 *  - runProjectBurnGenerator     (DB — projects + time_entries, 'margin')
 *  - runRetainerCapGenerator     (DB — retainer clients vs hours, 'pricing')
 *  - runConcentrationGenerator   (Xero — invoices T90d, 'risk')
 *  - runLeadsVolumeGenerator     (DB — leads vs trailing baseline, 'growth')
 *  - runAgiPerFteGenerator       (Xero+DB — revenue T90d / FTE, 'pricing')
 *  - runVendorHygieneGenerator   (DB — expenses MoM vendor growth, 'cost-control')
 *
 * All generators are idempotent: they skip clients/projects that already
 * have an open or in-progress recommendation in the same category +
 * scope key. The cron handler calls these directly; the per-generator
 * HTTP endpoints are thin auth wrappers around them.
 *
 * measureRecommendation() reads a rec + its snapshot and re-computes the
 * target metric. Used by the outcomes cron to populate
 * recommendation_outcomes 7/14/30d after acted_at — closing the loop on
 * whether the action actually moved the metric.
 */

import { queryOne, queryRows, execute } from './db'
import { fetchOutstandingReceivables } from './xeroDataFetcher'

export interface GeneratorResult {
  created: number
  skipped: number
  total: number
  scanned: number
  reason?: string
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`
}

async function insertRecommendation(rec: {
  tenant_id: string
  client_id: string | null
  title: string
  action: string
  impact: string
  priority: 'high' | 'medium' | 'low'
  target_metric: string
  baseline_metric_value: number
  target_direction: 'up' | 'down'
  category: string
  effort: 'xs' | 's' | 'm' | 'l' | 'xl'
  xero_metric_snapshot: Record<string, any>
}): Promise<void> {
  await execute(
    `INSERT INTO recommendations
       (tenant_id, client_id, title, action, impact, priority,
        target_metric, baseline_metric_value, target_direction,
        category, effort, xero_metric_snapshot, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ai')`,
    [
      rec.tenant_id,
      rec.client_id,
      rec.title,
      rec.action,
      rec.impact,
      rec.priority,
      rec.target_metric,
      rec.baseline_metric_value,
      rec.target_direction,
      rec.category,
      rec.effort,
      JSON.stringify(rec.xero_metric_snapshot),
    ]
  )
}

// ---------------------------------------------------------------------------
// Collections generator (Xero AR)
// ---------------------------------------------------------------------------

const COLLECTIONS_MIN_OVERDUE_AMOUNT = 1000
const COLLECTIONS_MIN_OVERDUE_COUNT = 2
const COLLECTIONS_HIGH_DAYS = 60
const COLLECTIONS_MEDIUM_DAYS = 30

interface AgencyClientRow {
  id: string
  name: string
  xero_contact_id: string | null
}

interface ARAggregate {
  contactId: string
  contactName: string
  totalOutstanding: number
  overdueAmount: number
  overdueCount: number
  maxDaysOverdue: number
}

function aggregateAR(invoices: any[]): Map<string, ARAggregate> {
  const today = new Date()
  const grouped = new Map<string, ARAggregate>()

  for (const invoice of invoices) {
    const contactId = invoice?.contact?.contactID
    if (!contactId) continue

    const amountDue = Number(invoice?.amountDue) || 0
    const dueDate = invoice?.dueDate ? new Date(invoice.dueDate) : null
    const isOverdue = !!(dueDate && dueDate < today)
    const daysOverdue = isOverdue && dueDate
      ? Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0

    if (!grouped.has(contactId)) {
      grouped.set(contactId, {
        contactId,
        contactName: invoice?.contact?.name || 'Unknown',
        totalOutstanding: 0,
        overdueAmount: 0,
        overdueCount: 0,
        maxDaysOverdue: 0,
      })
    }

    const entry = grouped.get(contactId)!
    entry.totalOutstanding += amountDue
    if (isOverdue) {
      entry.overdueAmount += amountDue
      entry.overdueCount += 1
      if (daysOverdue > entry.maxDaysOverdue) entry.maxDaysOverdue = daysOverdue
    }
  }

  return grouped
}

function classifyCollectionsPriority(maxDaysOverdue: number, overdueAmount: number): 'high' | 'medium' | 'low' {
  if (maxDaysOverdue >= COLLECTIONS_HIGH_DAYS || overdueAmount >= 10000) return 'high'
  if (maxDaysOverdue >= COLLECTIONS_MEDIUM_DAYS) return 'medium'
  return 'low'
}

export async function runCollectionsGenerator(
  tenantId: string,
  accessToken: string,
): Promise<GeneratorResult> {
  const outstandingBody = await fetchOutstandingReceivables(accessToken, tenantId)
  const invoices = outstandingBody?.invoices || []
  const aggregates = aggregateAR(invoices)

  const xeroIds = Array.from(aggregates.keys())
  const clientLookup = new Map<string, AgencyClientRow>()
  if (xeroIds.length > 0) {
    const clients = await queryRows<AgencyClientRow>(
      `SELECT id, name, xero_contact_id
       FROM agency_clients
       WHERE xero_contact_id = ANY($1::text[])`,
      [xeroIds]
    )
    for (const c of clients) {
      if (c.xero_contact_id) clientLookup.set(c.xero_contact_id, c)
    }
  }

  const candidates = Array.from(aggregates.values()).filter((agg) =>
    agg.overdueAmount >= COLLECTIONS_MIN_OVERDUE_AMOUNT
    && agg.overdueCount >= COLLECTIONS_MIN_OVERDUE_COUNT
  )

  let created = 0
  let skipped = 0

  for (const agg of candidates) {
    const client = clientLookup.get(agg.contactId) || null
    const priority = classifyCollectionsPriority(agg.maxDaysOverdue, agg.overdueAmount)

    const existing = client
      ? await queryOne<{ id: string }>(
          `SELECT id FROM recommendations
           WHERE tenant_id = $1 AND category = 'collections'
             AND status IN ('open', 'in_progress')
             AND client_id = $2
           LIMIT 1`,
          [tenantId, client.id]
        )
      : await queryOne<{ id: string }>(
          `SELECT id FROM recommendations
           WHERE tenant_id = $1 AND category = 'collections'
             AND status IN ('open', 'in_progress')
             AND client_id IS NULL
             AND xero_metric_snapshot->>'contactId' = $2
           LIMIT 1`,
          [tenantId, agg.contactId]
        )

    if (existing) {
      skipped++
      continue
    }

    const name = client?.name || agg.contactName
    const overdueCurrency = formatCurrency(agg.overdueAmount)

    await insertRecommendation({
      tenant_id: tenantId,
      client_id: client?.id ?? null,
      title: `${name}: ${overdueCurrency} overdue (${agg.overdueCount} invoice${agg.overdueCount === 1 ? '' : 's'}, ${agg.maxDaysOverdue}d past due)`,
      action: priority === 'high'
        ? `Call ${name} AP today and send statement. ${agg.maxDaysOverdue}d past due signals serious payment risk.`
        : `Send statement reminder + automated dunning to ${name}. Offer 2% early-payment discount if they're cash-tight.`,
      impact: `Recover ${overdueCurrency} in receivables — improves DSO and frees working capital.`,
      priority,
      target_metric: 'overdue_ar_amount',
      baseline_metric_value: agg.overdueAmount,
      target_direction: 'down',
      category: 'collections',
      effort: priority === 'high' ? 's' : 'xs',
      xero_metric_snapshot: {
        contactId: agg.contactId,
        totalOutstanding: agg.totalOutstanding,
        overdueAmount: agg.overdueAmount,
        overdueCount: agg.overdueCount,
        maxDaysOverdue: agg.maxDaysOverdue,
        generatedAt: new Date().toISOString(),
      },
    })
    created++
  }

  return { created, skipped, total: candidates.length, scanned: aggregates.size }
}

// ---------------------------------------------------------------------------
// Ad-pacing generator (DB-only — reads media_spend)
// ---------------------------------------------------------------------------

const PACING_MIN_BUDGET = 500
const PACING_MIN_DAYS_ELAPSED = 7
const PACING_LOW = 0.15
const PACING_MEDIUM = 0.20
const PACING_HIGH = 0.30

interface SpendRow {
  id: string
  client_id: string | null
  client_name: string | null
  platform: string
  budget_allocated: number
  actual_spend: number
  period: string
}

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function daysInCurrentMonth(): { elapsed: number; total: number } {
  const now = new Date()
  return {
    elapsed: now.getDate(),
    total: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
  }
}

function classifyPacingPriority(absVariance: number): 'high' | 'medium' | 'low' {
  if (absVariance >= PACING_HIGH) return 'high'
  if (absVariance >= PACING_MEDIUM) return 'medium'
  return 'low'
}

export async function runAdPacingGenerator(tenantId: string): Promise<GeneratorResult> {
  const period = currentPeriod()
  const { elapsed, total } = daysInCurrentMonth()
  const daysRemaining = total - elapsed

  if (elapsed < PACING_MIN_DAYS_ELAPSED) {
    return { created: 0, skipped: 0, total: 0, scanned: 0, reason: `period day ${elapsed} < ${PACING_MIN_DAYS_ELAPSED}` }
  }

  const rows = await queryRows<SpendRow>(
    `SELECT
       ms.id,
       ms.client_id,
       ac.name AS client_name,
       ms.platform,
       ms.budget_allocated::float AS budget_allocated,
       ms.actual_spend::float AS actual_spend,
       ms.period
     FROM media_spend ms
     LEFT JOIN agency_clients ac ON ac.id = ms.client_id
     WHERE ms.period = $1 AND ms.budget_allocated >= $2`,
    [period, PACING_MIN_BUDGET]
  )

  const periodRatio = elapsed / total
  const candidates: Array<{ row: SpendRow; expected: number; variance: number }> = []

  for (const row of rows) {
    const expected = row.budget_allocated * periodRatio
    if (expected <= 0) continue

    const variance = (row.actual_spend - expected) / expected
    if (Math.abs(variance) < PACING_LOW) continue

    candidates.push({ row, expected, variance })
  }

  let created = 0
  let skipped = 0

  for (const { row, expected, variance } of candidates) {
    const existing = row.client_id
      ? await queryOne<{ id: string }>(
          `SELECT id FROM recommendations
           WHERE tenant_id = $1 AND category = 'cost-control'
             AND status IN ('open', 'in_progress')
             AND client_id = $2
             AND xero_metric_snapshot->>'period' = $3
             AND xero_metric_snapshot->>'platform' = $4
           LIMIT 1`,
          [tenantId, row.client_id, row.period, row.platform]
        )
      : await queryOne<{ id: string }>(
          `SELECT id FROM recommendations
           WHERE tenant_id = $1 AND category = 'cost-control'
             AND status IN ('open', 'in_progress')
             AND client_id IS NULL
             AND xero_metric_snapshot->>'period' = $2
             AND xero_metric_snapshot->>'platform' = $3
             AND xero_metric_snapshot->>'mediaSpendId' = $4
           LIMIT 1`,
          [tenantId, row.period, row.platform, row.id]
        )

    if (existing) {
      skipped++
      continue
    }

    const direction = variance > 0 ? 'over' : 'under'
    const priority = classifyPacingPriority(Math.abs(variance))
    const platformLabel = row.platform.charAt(0).toUpperCase() + row.platform.slice(1)
    const name = row.client_name || 'Unmapped client'
    const projectedFinal = (row.actual_spend / Math.max(1, elapsed)) * total
    const projectedDelta = projectedFinal - row.budget_allocated
    const dollarGap = Math.abs(row.actual_spend - expected)

    await insertRecommendation({
      tenant_id: tenantId,
      client_id: row.client_id,
      title: direction === 'over'
        ? `${name} ${platformLabel}: ${formatPercent(variance)} over-pacing (${formatCurrency(row.actual_spend)} / ${formatCurrency(row.budget_allocated)} budget)`
        : `${name} ${platformLabel}: ${formatPercent(Math.abs(variance))} under-pacing (${formatCurrency(row.actual_spend)} / ${formatCurrency(row.budget_allocated)} budget)`,
      action: direction === 'over'
        ? `Pause or throttle campaigns by ~${formatPercent(variance)} for the remaining ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} of the cycle to land on budget. Otherwise expect ~${formatCurrency(Math.max(0, projectedDelta))} overspend.`
        : `Reallocate ~${formatCurrency(dollarGap)} or expand audience targeting in the next ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. At current pace you'll underspend by ~${formatCurrency(Math.abs(projectedDelta))}, leaving client results on the table.`,
      impact: direction === 'over'
        ? `Avoid ~${formatCurrency(Math.max(0, projectedDelta))} budget overrun + protect client trust on spend governance.`
        : `Capture ~${formatCurrency(Math.abs(projectedDelta))} of paid-media value the client expects this cycle.`,
      priority,
      target_metric: 'pacing_variance_pct',
      baseline_metric_value: variance,
      target_direction: 'down',
      category: 'cost-control',
      effort: priority === 'high' ? 's' : 'xs',
      xero_metric_snapshot: {
        mediaSpendId: row.id,
        platform: row.platform,
        period: row.period,
        budgetAllocated: row.budget_allocated,
        actualSpend: row.actual_spend,
        expectedSpend: expected,
        variance,
        daysRemaining,
        generatedAt: new Date().toISOString(),
      },
    })
    created++
  }

  return { created, skipped, total: candidates.length, scanned: rows.length }
}

// ---------------------------------------------------------------------------
// Project burn generator (DB-only — reads projects + time_entries)
// ---------------------------------------------------------------------------

const BURN_WARN = 0.70
const BURN_HIGH = 0.90

interface ProjectBurnRow {
  project_id: string
  project_name: string
  client_id: string
  client_name: string | null
  budget_amount: number
  budget_type: string
  spent: number
  billable_hours: number
}

function classifyBurnPriority(burnPct: number): 'high' | 'medium' | 'low' {
  if (burnPct >= BURN_HIGH) return 'high'
  if (burnPct >= BURN_WARN) return 'medium'
  return 'low'
}

export async function runProjectBurnGenerator(tenantId: string): Promise<GeneratorResult> {
  const rows = await queryRows<ProjectBurnRow>(
    `SELECT
       p.id AS project_id,
       p.name AS project_name,
       p.client_id,
       ac.name AS client_name,
       p.budget_amount::float AS budget_amount,
       p.budget_type,
       COALESCE(SUM(te.hours * te.hourly_rate) FILTER (WHERE te.billable IS TRUE), 0)::float AS spent,
       COALESCE(SUM(te.hours) FILTER (WHERE te.billable IS TRUE), 0)::float AS billable_hours
     FROM projects p
     LEFT JOIN agency_clients ac ON ac.id = p.client_id
     LEFT JOIN time_entries te ON te.project_id = p.id
     WHERE p.status = 'active'
       AND p.budget_amount > 0
       AND (p.end_date IS NULL OR p.end_date >= CURRENT_DATE)
     GROUP BY p.id, p.name, p.client_id, ac.name, p.budget_amount, p.budget_type`
  )

  const candidates = rows.filter((r) => r.spent / r.budget_amount >= BURN_WARN)
  let created = 0
  let skipped = 0

  for (const row of candidates) {
    const burnPct = row.spent / row.budget_amount
    const priority = classifyBurnPriority(burnPct)

    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM recommendations
       WHERE tenant_id = $1 AND category = 'margin'
         AND status IN ('open', 'in_progress')
         AND xero_metric_snapshot->>'projectId' = $2
       LIMIT 1`,
      [tenantId, row.project_id]
    )

    if (existing) {
      skipped++
      continue
    }

    const projectedOverrun = row.spent - row.budget_amount
    const remaining = row.budget_amount - row.spent
    const name = `${row.client_name || 'Unmapped client'} — ${row.project_name}`
    const burnLabel = formatPercent(burnPct)

    await insertRecommendation({
      tenant_id: tenantId,
      client_id: row.client_id,
      title: priority === 'high'
        ? `${name}: ${burnLabel} of budget burned (${formatCurrency(row.spent)} / ${formatCurrency(row.budget_amount)})`
        : `${name}: ${burnLabel} of budget burned with project still active`,
      action: priority === 'high'
        ? `Project is at ${burnLabel} of its ${formatCurrency(row.budget_amount)} budget. Issue a change order or pause non-essential work today — current pace projects ${formatCurrency(Math.max(0, projectedOverrun))} loss at completion.`
        : `Project has burned ${burnLabel} of budget (${formatCurrency(remaining)} remaining). Review scope vs. remaining deliverables; consider a SOW change order if scope exceeds remaining capacity.`,
      impact: priority === 'high'
        ? `Avoid losing ${formatCurrency(Math.max(0, -remaining))}+ on completion. Protect project margin.`
        : `Catch margin erosion before it becomes a write-off. Last-mile scope discipline = the difference between profit and loss on this project.`,
      priority,
      target_metric: 'project_burn_pct',
      baseline_metric_value: burnPct,
      target_direction: 'down',
      category: 'margin',
      effort: priority === 'high' ? 's' : 'xs',
      xero_metric_snapshot: {
        projectId: row.project_id,
        projectName: row.project_name,
        budgetAmount: row.budget_amount,
        budgetType: row.budget_type,
        spent: row.spent,
        billableHours: row.billable_hours,
        burnPct,
        generatedAt: new Date().toISOString(),
      },
    })
    created++
  }

  return { created, skipped, total: candidates.length, scanned: rows.length }
}

// ---------------------------------------------------------------------------
// Retainer cap breach (DB-only — agency_clients + time_entries + projects)
// ---------------------------------------------------------------------------

const RETAINER_WARN_BURN = 0.85   // 85% used → low priority
const RETAINER_HIGH_BURN = 1.00   // 100%+ used (cap breached) → high

interface RetainerRow {
  client_id: string
  client_name: string
  retainer_amount: number
  hourly_rate: number | null
  spent_this_month: number
  hours_this_month: number
}

export async function runRetainerCapGenerator(tenantId: string): Promise<GeneratorResult> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const { elapsed, total } = daysInCurrentMonth()
  const monthRatio = elapsed / total

  // Sum billable hours × hourly_rate per retainer client for current month.
  // Time entries don't link directly to clients, so go through projects.
  const rows = await queryRows<RetainerRow>(
    `SELECT
       ac.id AS client_id,
       ac.name AS client_name,
       ac.retainer_amount::float AS retainer_amount,
       ac.hourly_rate::float AS hourly_rate,
       COALESCE(SUM(te.hours * te.hourly_rate) FILTER (WHERE te.billable IS TRUE), 0)::float AS spent_this_month,
       COALESCE(SUM(te.hours) FILTER (WHERE te.billable IS TRUE), 0)::float AS hours_this_month
     FROM agency_clients ac
     LEFT JOIN projects p ON p.client_id = ac.id AND p.status = 'active'
     LEFT JOIN time_entries te ON te.project_id = p.id AND te.date >= $1
     WHERE ac.is_active IS TRUE
       AND ac.billing_type IN ('retainer', 'hybrid')
       AND ac.retainer_amount > 0
     GROUP BY ac.id, ac.name, ac.retainer_amount, ac.hourly_rate`,
    [monthStart]
  )

  // Skip the first ~10 days — too early to predict month-end overrun.
  if (elapsed < 10) {
    return { created: 0, skipped: 0, total: 0, scanned: rows.length, reason: `month day ${elapsed} < 10` }
  }

  const candidates = rows.filter((r) => {
    if (r.retainer_amount <= 0 || r.spent_this_month <= 0) return false
    const burn = r.spent_this_month / r.retainer_amount
    return burn >= RETAINER_WARN_BURN
  })

  let created = 0
  let skipped = 0

  for (const row of candidates) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM recommendations
       WHERE tenant_id = $1 AND category = 'pricing'
         AND status IN ('open', 'in_progress')
         AND client_id = $2
         AND xero_metric_snapshot->>'kind' = 'retainer-cap'
         AND xero_metric_snapshot->>'monthStart' = $3
       LIMIT 1`,
      [tenantId, row.client_id, monthStart]
    )
    if (existing) { skipped++; continue }

    const burnPct = row.spent_this_month / row.retainer_amount
    // Project month-end based on linear burn assumption.
    const projectedFinal = row.spent_this_month / Math.max(0.01, monthRatio)
    const projectedOverrun = projectedFinal - row.retainer_amount
    const priority: 'high' | 'medium' | 'low' = burnPct >= RETAINER_HIGH_BURN
      ? 'high'
      : burnPct >= 0.95 ? 'medium' : 'low'

    await insertRecommendation({
      tenant_id: tenantId,
      client_id: row.client_id,
      title: burnPct >= RETAINER_HIGH_BURN
        ? `${row.client_name}: retainer cap breached on day ${elapsed} (${formatPercent(burnPct)} of ${formatCurrency(row.retainer_amount)})`
        : `${row.client_name}: retainer ${formatPercent(burnPct)} burned on day ${elapsed} of month`,
      action: burnPct >= RETAINER_HIGH_BURN
        ? `Retainer cap exceeded with ${total - elapsed} day${total - elapsed === 1 ? '' : 's'} remaining. Stop discretionary work, document scope creep, and propose a retainer uplift or change-order at next QBR. Projected ${formatCurrency(Math.max(0, projectedOverrun))} of unbilled labor.`
        : `On track to exceed retainer cap by ${formatCurrency(Math.max(0, projectedOverrun))} this month. Audit hours-by-task, cut non-priority work, or open a change-order conversation now while there's still leverage.`,
      impact: `Recover ${formatCurrency(Math.max(0, projectedOverrun))} of margin or convert to a retainer uplift at next renewal.`,
      priority,
      target_metric: 'retainer_burn_pct',
      baseline_metric_value: burnPct,
      target_direction: 'down',
      category: 'pricing',
      effort: priority === 'high' ? 's' : 'xs',
      xero_metric_snapshot: {
        kind: 'retainer-cap',
        clientId: row.client_id,
        retainerAmount: row.retainer_amount,
        spentThisMonth: row.spent_this_month,
        hoursThisMonth: row.hours_this_month,
        monthStart,
        monthDay: elapsed,
        burnPct,
        generatedAt: new Date().toISOString(),
      },
    })
    created++
  }

  return { created, skipped, total: candidates.length, scanned: rows.length }
}

// ---------------------------------------------------------------------------
// Concentration risk (Xero — invoices T90d)
// ---------------------------------------------------------------------------

const CONCENTRATION_TOP1_THRESHOLD = 0.20
const CONCENTRATION_TOP3_THRESHOLD = 0.50

export async function runConcentrationGenerator(
  tenantId: string,
  accessToken: string,
): Promise<GeneratorResult> {
  // Pull all paid + authorised AR invoices in last 90 days. Sum by contact.
  // We deliberately use AUTHORISED + PAID (both states represent real billings)
  // to capture actual revenue concentration rather than just receivables.
  const today = new Date()
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
  const fromDate = `DateTime(${ninetyDaysAgo.getUTCFullYear()}, ${ninetyDaysAgo.getUTCMonth() + 1}, ${ninetyDaysAgo.getUTCDate()})`

  const params = new URLSearchParams({
    where: `Type=="ACCREC"&&(Status=="AUTHORISED"||Status=="PAID")&&Date>=${fromDate}`,
    order: 'Date DESC',
    page: '1',
    pageSize: '500',
  })

  const { xeroFetch } = await import('./xeroClient')
  const body = await xeroFetch<any>({ accessToken, tenantId, path: `Invoices?${params.toString()}` })
  const invoices = body?.invoices || []

  const grouped = new Map<string, { name: string; total: number; count: number }>()
  for (const inv of invoices) {
    const contactId = inv?.contact?.contactID
    if (!contactId) continue
    const total = Number(inv?.total) || 0
    if (!grouped.has(contactId)) grouped.set(contactId, { name: inv.contact?.name || 'Unknown', total: 0, count: 0 })
    const entry = grouped.get(contactId)!
    entry.total += total
    entry.count += 1
  }

  const totals = Array.from(grouped.entries())
    .map(([contactId, data]) => ({ contactId, ...data }))
    .sort((a, b) => b.total - a.total)
  const grandTotal = totals.reduce((s, x) => s + x.total, 0)

  if (grandTotal <= 0 || totals.length === 0) {
    return { created: 0, skipped: 0, total: 0, scanned: invoices.length, reason: 'no T90d revenue' }
  }

  const top1 = totals[0]
  if (!top1) return { created: 0, skipped: 0, total: 0, scanned: invoices.length, reason: 'no clients' }

  const top1Pct = top1.total / grandTotal
  const top3Pct = totals.slice(0, 3).reduce((s, x) => s + x.total, 0) / grandTotal

  // We emit at most one concentration rec — the top-line risk. If neither
  // threshold is breached, no action.
  if (top1Pct < CONCENTRATION_TOP1_THRESHOLD && top3Pct < CONCENTRATION_TOP3_THRESHOLD) {
    return { created: 0, skipped: 0, total: 0, scanned: invoices.length, reason: 'within thresholds' }
  }

  // Idempotency: one open concentration-risk rec per tenant at a time.
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM recommendations
     WHERE tenant_id = $1 AND category = 'risk'
       AND status IN ('open', 'in_progress')
       AND xero_metric_snapshot->>'kind' = 'concentration'
     LIMIT 1`,
    [tenantId]
  )
  if (existing) {
    return { created: 0, skipped: 1, total: 1, scanned: invoices.length }
  }

  // Match top-1 to internal client if linked.
  const client = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM agency_clients WHERE xero_contact_id = $1 LIMIT 1`,
    [top1.contactId]
  )

  const breaching = top1Pct >= CONCENTRATION_TOP1_THRESHOLD
  const priority: 'high' | 'medium' | 'low' = top1Pct >= 0.40 ? 'high' : top1Pct >= 0.30 ? 'medium' : 'low'

  await insertRecommendation({
    tenant_id: tenantId,
    client_id: client?.id ?? null,
    title: breaching
      ? `${top1.name}: ${formatPercent(top1Pct)} of trailing-90d revenue (above 20% threshold)`
      : `Top-3 clients = ${formatPercent(top3Pct)} of trailing-90d revenue`,
    action: breaching
      ? `Single client = ${formatPercent(top1Pct)} of revenue (${formatCurrency(top1.total)} / ${formatCurrency(grandTotal)}). Bring 2 prospects to proposal stage in next 30 days. If ${top1.name} churned tomorrow, payroll runway shortens dramatically.`
      : `Top-3 clients are ${formatPercent(top3Pct)} of revenue. Prioritise lead generation + diversify the pipeline before the next contract renewal cycle.`,
    impact: `De-risk revenue stream. Healthier targets: top-1 ≤15%, top-5 ≤40%.`,
    priority,
    target_metric: 'top_client_revenue_pct',
    baseline_metric_value: top1Pct,
    target_direction: 'down',
    category: 'risk',
    effort: 'l',
    xero_metric_snapshot: {
      kind: 'concentration',
      topClient: { contactId: top1.contactId, name: top1.name, total: top1.total, pct: top1Pct },
      top3Pct,
      grandTotal,
      windowDays: 90,
      generatedAt: new Date().toISOString(),
    },
  })

  return { created: 1, skipped: 0, total: 1, scanned: invoices.length }
}

// ---------------------------------------------------------------------------
// Leads volume drift (DB-only — leads vs trailing baseline)
// ---------------------------------------------------------------------------

export async function runLeadsVolumeGenerator(tenantId: string): Promise<GeneratorResult> {
  // Compare current 30d to prior 90d trailing average. Uses raw lead counts —
  // we exclude spam'd entries since those are noise.
  const recentRow = await queryOne<{ recent_30d: number; baseline_90d: number; spam_count: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '30 days' AND status != 'spam')::int AS recent_30d,
       COUNT(*) FILTER (WHERE submitted_at >= NOW() - INTERVAL '120 days'
                          AND submitted_at <  NOW() - INTERVAL '30 days'
                          AND status != 'spam')::int AS baseline_90d,
       COUNT(*) FILTER (WHERE status = 'spam' AND submitted_at >= NOW() - INTERVAL '30 days')::int AS spam_count
     FROM leads`
  )

  if (!recentRow) {
    return { created: 0, skipped: 0, total: 0, scanned: 0, reason: 'no leads table data' }
  }

  const recent30d = Number(recentRow.recent_30d) || 0
  const baseline90d = Number(recentRow.baseline_90d) || 0

  // Need a meaningful baseline to compare against (>= 6 leads in prior 90d).
  if (baseline90d < 6) {
    return { created: 0, skipped: 0, total: 0, scanned: recent30d + baseline90d, reason: 'insufficient baseline' }
  }

  const baselineMonthly = baseline90d / 3
  if (baselineMonthly <= 0) {
    return { created: 0, skipped: 0, total: 0, scanned: recent30d + baseline90d, reason: 'zero baseline' }
  }

  const drift = (recent30d - baselineMonthly) / baselineMonthly

  // Only fire on a *drop*: surplus leads aren't a problem to recommend on.
  if (drift > -0.30) {
    return { created: 0, skipped: 0, total: 0, scanned: recent30d + baseline90d, reason: `drift ${formatPercent(drift)} above -30% threshold` }
  }

  // Idempotency: one open growth/leads rec per tenant at a time.
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM recommendations
     WHERE tenant_id = $1 AND category = 'growth'
       AND status IN ('open', 'in_progress')
       AND xero_metric_snapshot->>'kind' = 'leads-volume'
     LIMIT 1`,
    [tenantId]
  )
  if (existing) {
    return { created: 0, skipped: 1, total: 1, scanned: recent30d + baseline90d }
  }

  const dropPct = Math.abs(drift)
  const priority: 'high' | 'medium' | 'low' = dropPct >= 0.60 ? 'high' : dropPct >= 0.45 ? 'medium' : 'low'

  await insertRecommendation({
    tenant_id: tenantId,
    client_id: null,
    title: `Leads volume down ${formatPercent(dropPct)}: ${recent30d} this month vs ${Math.round(baselineMonthly)} prior 3-mo avg`,
    action: `New leads have dropped ${formatPercent(dropPct)} from baseline. Either inbound is broken (check landing pages + form integrations + attribution) or outbound + paid have stalled. Investigate this week — lead volume leads revenue 60-90 days out.`,
    impact: `Catching the dip now protects Q+1 revenue. Each missing lead at typical close-rate = ~lost revenue × 0.${'2'}.`,
    priority,
    target_metric: 'monthly_lead_count',
    baseline_metric_value: recent30d,
    target_direction: 'up',
    category: 'growth',
    effort: 'm',
    xero_metric_snapshot: {
      kind: 'leads-volume',
      recent30d,
      baseline90d,
      baselineMonthly,
      drift,
      spamCount: Number(recentRow.spam_count) || 0,
      generatedAt: new Date().toISOString(),
    },
  })

  return { created: 1, skipped: 0, total: 1, scanned: recent30d + baseline90d }
}

// ---------------------------------------------------------------------------
// AGI / FTE drift (Xero+DB — revenue T90d / active team count)
// ---------------------------------------------------------------------------

const AGI_FTE_TARGET_T90D = 37500   // ~$150K annual / 4 ≈ $37.5K trailing-90d per FTE
const AGI_FTE_LOW_PRIORITY = 0.80   // <80% of target → low
const AGI_FTE_MEDIUM_PRIORITY = 0.65 // <65% → medium
const AGI_FTE_HIGH_PRIORITY = 0.50  // <50% → high

export async function runAgiPerFteGenerator(
  tenantId: string,
  accessToken: string,
): Promise<GeneratorResult> {
  // Total revenue from PAID + AUTHORISED ACCREC invoices in last 90 days.
  // Pass-through media costs aren't excluded here (true AGI would subtract
  // them) — keep it simple for v1; refine when we have per-client cost data.
  const today = new Date()
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
  const fromDate = `DateTime(${ninetyDaysAgo.getUTCFullYear()}, ${ninetyDaysAgo.getUTCMonth() + 1}, ${ninetyDaysAgo.getUTCDate()})`

  const params = new URLSearchParams({
    where: `Type=="ACCREC"&&(Status=="AUTHORISED"||Status=="PAID")&&Date>=${fromDate}`,
    page: '1',
    pageSize: '500',
  })

  const { xeroFetch } = await import('./xeroClient')
  const body = await xeroFetch<any>({ accessToken, tenantId, path: `Invoices?${params.toString()}` })
  const invoices = body?.invoices || []
  const totalRevenue = invoices.reduce((s: number, i: any) => s + (Number(i?.total) || 0), 0)

  // Count active team members. is_active=true is the canonical filter.
  const fteRow = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM team_members WHERE is_active IS TRUE`
  )
  const fte = Number(fteRow?.count) || 0

  if (fte === 0) {
    return { created: 0, skipped: 0, total: 0, scanned: invoices.length, reason: 'no active team members' }
  }

  const revenuePerFte = totalRevenue / fte
  const ratio = revenuePerFte / AGI_FTE_TARGET_T90D

  // Only flag when materially below target. Above target = no action needed.
  if (ratio >= AGI_FTE_LOW_PRIORITY) {
    return { created: 0, skipped: 0, total: 0, scanned: invoices.length, reason: `ratio ${ratio.toFixed(2)} above ${AGI_FTE_LOW_PRIORITY}` }
  }

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM recommendations
     WHERE tenant_id = $1 AND category = 'pricing'
       AND status IN ('open', 'in_progress')
       AND xero_metric_snapshot->>'kind' = 'agi-per-fte'
     LIMIT 1`,
    [tenantId]
  )
  if (existing) {
    return { created: 0, skipped: 1, total: 1, scanned: invoices.length }
  }

  const priority: 'high' | 'medium' | 'low' = ratio < AGI_FTE_HIGH_PRIORITY
    ? 'high' : ratio < AGI_FTE_MEDIUM_PRIORITY ? 'medium' : 'low'

  await insertRecommendation({
    tenant_id: tenantId,
    client_id: null,
    title: `Revenue per FTE = ${formatCurrency(revenuePerFte)} (T90d) vs ${formatCurrency(AGI_FTE_TARGET_T90D)} target`,
    action: `Revenue per FTE is ${formatPercent(1 - ratio)} below the ${formatCurrency(AGI_FTE_TARGET_T90D)} T90d benchmark. Either price up by ~${formatPercent(1 - ratio)} on the next 3 SOWs, hold the next hire 60 days while revenue catches up, or audit utilisation for hidden capacity.`,
    impact: `Closing the gap = ${formatCurrency((AGI_FTE_TARGET_T90D - revenuePerFte) * fte)} more T90d revenue at current headcount.`,
    priority,
    target_metric: 'revenue_per_fte_t90d',
    baseline_metric_value: revenuePerFte,
    target_direction: 'up',
    category: 'pricing',
    effort: 'l',
    xero_metric_snapshot: {
      kind: 'agi-per-fte',
      totalRevenueT90d: totalRevenue,
      fteCount: fte,
      revenuePerFte,
      target: AGI_FTE_TARGET_T90D,
      ratio,
      generatedAt: new Date().toISOString(),
    },
  })

  return { created: 1, skipped: 0, total: 1, scanned: invoices.length }
}

// ---------------------------------------------------------------------------
// Vendor hygiene (DB — expenses MoM growth per merchant)
// ---------------------------------------------------------------------------

const VENDOR_MIN_MONTHLY_AMOUNT = 200      // skip noise
const VENDOR_GROWTH_THRESHOLD = 0.50       // 50% MoM

interface VendorRow {
  merchant: string
  current_amount: number
  prior_amount: number
}

export async function runVendorHygieneGenerator(tenantId: string): Promise<GeneratorResult> {
  // Compare last 30d expense total per merchant against prior 30d (60-30 days ago).
  // Looks for sudden growth — most useful for catching duplicate SaaS,
  // unused subscriptions, or vendor price drift.
  const rows = await queryRows<VendorRow>(
    `SELECT
       LOWER(TRIM(merchant)) AS merchant,
       COALESCE(SUM(amount_usd) FILTER (
         WHERE expense_date >= CURRENT_DATE - INTERVAL '30 days'
       ), 0)::float AS current_amount,
       COALESCE(SUM(amount_usd) FILTER (
         WHERE expense_date >= CURRENT_DATE - INTERVAL '60 days'
           AND expense_date <  CURRENT_DATE - INTERVAL '30 days'
       ), 0)::float AS prior_amount
     FROM expenses
     WHERE merchant IS NOT NULL
       AND merchant != ''
       AND expense_date >= CURRENT_DATE - INTERVAL '60 days'
     GROUP BY LOWER(TRIM(merchant))
     HAVING COALESCE(SUM(amount_usd) FILTER (
              WHERE expense_date >= CURRENT_DATE - INTERVAL '30 days'
            ), 0) >= $1`,
    [VENDOR_MIN_MONTHLY_AMOUNT]
  )

  // Need both periods present and material growth to fire.
  const candidates = rows.filter((r) => {
    if (r.prior_amount <= 0) return false
    const growth = (r.current_amount - r.prior_amount) / r.prior_amount
    return growth >= VENDOR_GROWTH_THRESHOLD
  })

  let created = 0
  let skipped = 0

  for (const row of candidates) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM recommendations
       WHERE tenant_id = $1 AND category = 'cost-control'
         AND status IN ('open', 'in_progress')
         AND xero_metric_snapshot->>'kind' = 'vendor-growth'
         AND xero_metric_snapshot->>'merchant' = $2
       LIMIT 1`,
      [tenantId, row.merchant]
    )
    if (existing) { skipped++; continue }

    const growth = (row.current_amount - row.prior_amount) / row.prior_amount
    const dollarGrowth = row.current_amount - row.prior_amount
    const priority: 'high' | 'medium' | 'low' = growth >= 2.0 ? 'high' : growth >= 1.0 ? 'medium' : 'low'
    const merchantLabel = row.merchant.charAt(0).toUpperCase() + row.merchant.slice(1)

    await insertRecommendation({
      tenant_id: tenantId,
      client_id: null,
      title: `${merchantLabel}: spend up ${formatPercent(growth)} MoM (${formatCurrency(row.prior_amount)} → ${formatCurrency(row.current_amount)})`,
      action: `Expenses to ${merchantLabel} grew by ${formatCurrency(dollarGrowth)} this month. Check for duplicate subscriptions, unused seats, or recently-rolled price hikes. If recurring SaaS, audit who's using it and downgrade tiers if possible.`,
      impact: `Reclaim ${formatCurrency(dollarGrowth)}/mo if growth is from waste; ${formatCurrency(dollarGrowth * 12)}/yr.`,
      priority,
      target_metric: 'vendor_spend_mom_growth',
      baseline_metric_value: growth,
      target_direction: 'down',
      category: 'cost-control',
      effort: 'xs',
      xero_metric_snapshot: {
        kind: 'vendor-growth',
        merchant: row.merchant,
        currentAmount: row.current_amount,
        priorAmount: row.prior_amount,
        growth,
        generatedAt: new Date().toISOString(),
      },
    })
    created++
  }

  return { created, skipped, total: candidates.length, scanned: rows.length }
}

// ---------------------------------------------------------------------------
// Outcome measurement — dispatch by category + snapshot.kind
// ---------------------------------------------------------------------------

export interface MeasureContext {
  tenantId: string
  accessToken: string | null
}

export interface MeasurementResult {
  metric_value: number
  metric_delta: number
  notes?: string
}

interface RecForMeasurement {
  id: string
  category: string | null
  baseline_metric_value: number | null
  target_direction: 'up' | 'down' | null
  xero_metric_snapshot: Record<string, any> | null
}

/**
 * Re-compute the target metric for a closed recommendation. Returns null
 * if the metric cannot be re-computed (snapshot incomplete, source data
 * gone, or Xero token missing for a Xero-backed measurement).
 *
 * `metric_delta` is signed by target_direction so positive = improvement.
 */
export async function measureRecommendation(
  rec: RecForMeasurement,
  ctx: MeasureContext,
): Promise<MeasurementResult | null> {
  const snap = rec.xero_metric_snapshot || {}
  const baseline = Number(rec.baseline_metric_value ?? 0)
  const direction: 'up' | 'down' = rec.target_direction || 'down'

  function makeResult(currentValue: number, notes?: string): MeasurementResult {
    const rawDelta = currentValue - baseline
    // Sign delta so positive = improvement regardless of metric direction.
    const metricDelta = direction === 'down' ? -rawDelta : rawDelta
    return { metric_value: currentValue, metric_delta: metricDelta, notes }
  }

  switch (rec.category) {
    case 'collections': {
      if (!ctx.accessToken) return null
      const contactId = snap.contactId
      if (!contactId) return null
      const today = new Date()
      const body = await fetchOutstandingReceivables(ctx.accessToken, ctx.tenantId)
      const invoices = body?.invoices || []
      let outstanding = 0
      for (const inv of invoices) {
        if (inv?.contact?.contactID !== contactId) continue
        const dueDate = inv?.dueDate ? new Date(inv.dueDate) : null
        if (dueDate && dueDate < today) outstanding += Number(inv?.amountDue) || 0
      }
      return makeResult(outstanding, `re-scanned AR for ${snap.contactId}`)
    }

    case 'cost-control': {
      // Two flavours: ad-pacing (snap.kind missing or platform/period present)
      // and vendor-growth.
      if (snap.kind === 'vendor-growth') {
        const row = await queryOne<{ amt: number }>(
          `SELECT COALESCE(SUM(amount_usd), 0)::float AS amt
           FROM expenses
           WHERE LOWER(TRIM(merchant)) = $1
             AND expense_date >= CURRENT_DATE - INTERVAL '30 days'`,
          [snap.merchant]
        )
        const current = Number(row?.amt) || 0
        // Recompute growth versus the same prior baseline used at generation.
        const prior = Number(snap.priorAmount) || 0
        const growth = prior > 0 ? (current - prior) / prior : 0
        return makeResult(growth, `vendor ${snap.merchant} 30d=${current}`)
      }
      // Ad-pacing
      if (snap.mediaSpendId) {
        const row = await queryOne<{ budget: number; spent: number; period: string }>(
          `SELECT budget_allocated::float AS budget, actual_spend::float AS spent, period
           FROM media_spend WHERE id = $1`,
          [snap.mediaSpendId]
        )
        if (!row) return makeResult(0, 'media_spend row deleted')
        const expected = Number(row.budget) // for measurement, compare actual vs full budget after period closes
        const variance = expected > 0 ? (Number(row.spent) - expected) / expected : 0
        return makeResult(variance, `media_spend ${snap.platform} ${row.period}`)
      }
      return null
    }

    case 'margin': {
      // Project burn
      const projectId = snap.projectId
      if (!projectId) return null
      const row = await queryOne<{ budget: number; spent: number }>(
        `SELECT
           p.budget_amount::float AS budget,
           COALESCE(SUM(te.hours * te.hourly_rate) FILTER (WHERE te.billable IS TRUE), 0)::float AS spent
         FROM projects p
         LEFT JOIN time_entries te ON te.project_id = p.id
         WHERE p.id = $1
         GROUP BY p.id, p.budget_amount`,
        [projectId]
      )
      if (!row || !row.budget || row.budget <= 0) return null
      const burnPct = Number(row.spent) / Number(row.budget)
      return makeResult(burnPct, `project ${projectId} burn`)
    }

    case 'pricing': {
      if (snap.kind === 'retainer-cap') {
        const row = await queryOne<{ retainer: number; spent: number }>(
          `SELECT
             ac.retainer_amount::float AS retainer,
             COALESCE(SUM(te.hours * te.hourly_rate) FILTER (
               WHERE te.billable IS TRUE
                 AND te.date >= $2::date
             ), 0)::float AS spent
           FROM agency_clients ac
           LEFT JOIN projects p ON p.client_id = ac.id
           LEFT JOIN time_entries te ON te.project_id = p.id
           WHERE ac.id = $1
           GROUP BY ac.id, ac.retainer_amount`,
          [snap.clientId, snap.monthStart]
        )
        if (!row || !row.retainer) return null
        const burnPct = Number(row.spent) / Number(row.retainer)
        return makeResult(burnPct, `retainer client ${snap.clientId}`)
      }
      if (snap.kind === 'agi-per-fte') {
        if (!ctx.accessToken) return null
        const today = new Date()
        const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
        const fromDate = `DateTime(${ninetyDaysAgo.getUTCFullYear()}, ${ninetyDaysAgo.getUTCMonth() + 1}, ${ninetyDaysAgo.getUTCDate()})`
        const params = new URLSearchParams({
          where: `Type=="ACCREC"&&(Status=="AUTHORISED"||Status=="PAID")&&Date>=${fromDate}`,
          pageSize: '500',
        })
        const { xeroFetch } = await import('./xeroClient')
        const body = await xeroFetch<any>({ accessToken: ctx.accessToken, tenantId: ctx.tenantId, path: `Invoices?${params.toString()}` })
        const invs = body?.invoices || []
        const total = invs.reduce((s: number, i: any) => s + (Number(i?.total) || 0), 0)
        const fteRow = await queryOne<{ count: number }>(`SELECT COUNT(*)::int AS count FROM team_members WHERE is_active IS TRUE`)
        const fte = Number(fteRow?.count) || 1
        return makeResult(total / fte, `T90d revenue/FTE`)
      }
      return null
    }

    case 'risk': {
      if (snap.kind === 'concentration') {
        if (!ctx.accessToken) return null
        const today = new Date()
        const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)
        const fromDate = `DateTime(${ninetyDaysAgo.getUTCFullYear()}, ${ninetyDaysAgo.getUTCMonth() + 1}, ${ninetyDaysAgo.getUTCDate()})`
        const params = new URLSearchParams({
          where: `Type=="ACCREC"&&(Status=="AUTHORISED"||Status=="PAID")&&Date>=${fromDate}`,
          pageSize: '500',
        })
        const { xeroFetch } = await import('./xeroClient')
        const body = await xeroFetch<any>({ accessToken: ctx.accessToken, tenantId: ctx.tenantId, path: `Invoices?${params.toString()}` })
        const invs = body?.invoices || []
        const grouped = new Map<string, number>()
        for (const inv of invs) {
          const id = inv?.contact?.contactID
          if (!id) continue
          grouped.set(id, (grouped.get(id) || 0) + (Number(inv?.total) || 0))
        }
        const grand = Array.from(grouped.values()).reduce((a, b) => a + b, 0)
        const top = snap.topClient?.contactId ? (grouped.get(snap.topClient.contactId) || 0) : 0
        const pct = grand > 0 ? top / grand : 0
        return makeResult(pct, `top-1 concentration`)
      }
      return null
    }

    case 'growth': {
      if (snap.kind === 'leads-volume') {
        const row = await queryOne<{ recent: number }>(
          `SELECT COUNT(*) FILTER (
             WHERE submitted_at >= NOW() - INTERVAL '30 days' AND status != 'spam'
           )::int AS recent
           FROM leads`
        )
        return makeResult(Number(row?.recent) || 0, `T30d leads volume`)
      }
      return null
    }
  }

  return null
}
