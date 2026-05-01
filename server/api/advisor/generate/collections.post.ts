/**
 * POST /api/advisor/generate/collections
 *
 * Scans Xero outstanding receivables and creates `recommendations`
 * rows for clients whose AR has drifted: high overdue amount, many
 * overdue invoices, or significant days-past-due. Idempotent — if
 * an open/in_progress collections rec already exists for a
 * (tenant_id, client_id) pair, the client is skipped.
 *
 * Returns { created, skipped, total } so the UI can surface a toast.
 */

import { createError } from 'h3'
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { fetchOutstandingReceivables } from '~~/server/utils/xeroDataFetcher'

// Thresholds — tuned to surface meaningful items without noise.
// Owners can adjust these later via a settings UI; hard-coded for v1.
const MIN_OVERDUE_AMOUNT = 1000      // AUD — anything smaller is rounding error
const MIN_OVERDUE_COUNT = 2          // single late invoice = noise
const HIGH_PRIORITY_OVERDUE_DAYS = 60
const MEDIUM_PRIORITY_OVERDUE_DAYS = 30

interface AgencyClient {
  id: string
  name: string
  xero_contact_id: string | null
  payment_terms: number | null
}

interface InvoiceAggregate {
  contactId: string
  contactName: string
  totalOutstanding: number
  overdueAmount: number
  overdueCount: number
  totalCount: number
  oldestDueDate: Date | null
  maxDaysOverdue: number
}

function aggregateByContact(invoices: any[]): Map<string, InvoiceAggregate> {
  const today = new Date()
  const grouped = new Map<string, InvoiceAggregate>()

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
        totalCount: 0,
        oldestDueDate: null,
        maxDaysOverdue: 0,
      })
    }

    const entry = grouped.get(contactId)!
    entry.totalOutstanding += amountDue
    entry.totalCount += 1
    if (isOverdue) {
      entry.overdueAmount += amountDue
      entry.overdueCount += 1
      if (daysOverdue > entry.maxDaysOverdue) entry.maxDaysOverdue = daysOverdue
      if (!entry.oldestDueDate || (dueDate && dueDate < entry.oldestDueDate)) {
        entry.oldestDueDate = dueDate
      }
    }
  }

  return grouped
}

function classifyPriority(maxDaysOverdue: number, overdueAmount: number): 'high' | 'medium' | 'low' {
  if (maxDaysOverdue >= HIGH_PRIORITY_OVERDUE_DAYS || overdueAmount >= 10000) return 'high'
  if (maxDaysOverdue >= MEDIUM_PRIORITY_OVERDUE_DAYS) return 'medium'
  return 'low'
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

function buildRecommendation(agg: InvoiceAggregate, client: AgencyClient | null) {
  const priority = classifyPriority(agg.maxDaysOverdue, agg.overdueAmount)
  const name = client?.name || agg.contactName
  const overdueCurrency = formatCurrency(agg.overdueAmount)

  // Specificity formula: named entity + measured delta + threshold + action + $ impact
  const title = `${name}: ${overdueCurrency} overdue (${agg.overdueCount} invoice${agg.overdueCount === 1 ? '' : 's'}, ${agg.maxDaysOverdue}d past due)`
  const action = priority === 'high'
    ? `Call ${name} AP today and send statement. ${agg.maxDaysOverdue}d past due signals serious payment risk.`
    : `Send statement reminder + automated dunning to ${name}. Offer 2% early-payment discount if they're cash-tight.`
  const impact = `Recover ${overdueCurrency} in receivables — improves DSO and frees working capital.`

  return {
    title,
    action,
    impact,
    priority,
    target_metric: 'overdue_ar_amount',
    baseline_metric_value: agg.overdueAmount,
    target_direction: 'down' as const,
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
  }
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const token = await getActiveTokenForSession(event)
  const accessToken = token.access_token!

  // 1. Fetch outstanding AR from Xero
  const outstandingBody = await fetchOutstandingReceivables(accessToken, tenantId)
  const invoices = outstandingBody?.invoices || []

  // 2. Aggregate by contact
  const aggregates = aggregateByContact(invoices)

  // 3. Map Xero contacts → agency_clients (so recs link to internal client_id)
  const xeroIds = Array.from(aggregates.keys())
  const clientLookup = new Map<string, AgencyClient>()
  if (xeroIds.length > 0) {
    const clients = await queryRows<AgencyClient>(
      `SELECT id, name, xero_contact_id, payment_terms
       FROM agency_clients
       WHERE xero_contact_id = ANY($1::text[])`,
      [xeroIds]
    )
    for (const c of clients) {
      if (c.xero_contact_id) clientLookup.set(c.xero_contact_id, c)
    }
  }

  // 4. Filter to clients meeting threshold
  const candidates = Array.from(aggregates.values()).filter((agg) =>
    agg.overdueAmount >= MIN_OVERDUE_AMOUNT && agg.overdueCount >= MIN_OVERDUE_COUNT
  )

  let created = 0
  let skipped = 0

  // 5. For each candidate: insert recommendation if no open/in_progress collections rec exists
  for (const agg of candidates) {
    const client = clientLookup.get(agg.contactId) || null

    // Idempotency: skip if there's already an active collections rec for this client.
    // We match on client_id when available, otherwise on the Xero contactId in the
    // snapshot to avoid duplicates for clients not yet linked to agency_clients.
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

    const rec = buildRecommendation(agg, client)
    await execute(
      `INSERT INTO recommendations
        (tenant_id, client_id, title, action, impact, priority,
         target_metric, baseline_metric_value, target_direction,
         category, effort, xero_metric_snapshot, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ai')`,
      [
        tenantId,
        client?.id ?? null,
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
    created++
  }

  return {
    created,
    skipped,
    total: candidates.length,
    scanned: aggregates.size,
  }
})
