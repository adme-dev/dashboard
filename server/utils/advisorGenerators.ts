/**
 * Recommendation generators — pure tenant-scoped runners.
 *
 * Three generators produce rows in the `recommendations` table:
 *  - runCollectionsGenerator (needs Xero access token — scans AR)
 *  - runAdPacingGenerator    (DB-only — reads media_spend)
 *  - runProjectBurnGenerator (DB-only — reads projects + time_entries)
 *
 * All generators are idempotent: they skip clients/projects that already
 * have an open or in-progress recommendation in the same category. The
 * cron handler calls these directly; the per-generator HTTP endpoints
 * are thin auth wrappers around them.
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
