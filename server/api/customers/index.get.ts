/**
 * GET /api/customers
 *
 * Enriched customer list reading from xero_contacts_cache + xero_customer_rollups.
 * No live Xero call — sub-100ms regardless of book size, refreshed by the
 * 15-min cron (POST /api/cron/xero-customer-sync).
 *
 * Response shape powers the customer hub list view: per-row LTV / YTD / DSO /
 * concentration / sparkline + dashboard-level totals.
 */

import { defineEventHandler, getQuery, createError } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface RawRow {
  contact_id: string
  name: string
  email: string | null
  phone: string | null
  website: string | null
  is_customer: boolean
  is_supplier: boolean
  status: string
  default_currency: string | null
  payment_terms_days: number | null
  payment_terms_type: string | null
  account_number: string | null
  tax_number: string | null
  receivable_outstanding_cents: string | number
  receivable_overdue_cents: string | number
  payable_outstanding_cents: string | number
  payable_overdue_cents: string | number
  // From rollups (LEFT JOIN — may be null for never-invoiced contacts)
  ltv_cents: string | number | null
  ytd_revenue_cents: string | number | null
  last_12m_revenue_cents: string | number | null
  last_12m_buckets: Array<{ month: string; cents: number }> | null
  invoice_count: number | null
  paid_invoice_count: number | null
  avg_invoice_cents: string | number | null
  dso_days: string | null
  paid_late_pct: string | null
  outstanding_cents_rollup: string | number | null
  overdue_cents_rollup: string | number | null
  oldest_overdue_days: number | null
  aging_buckets: Record<string, number> | null
  mrr_cents: string | number | null
  has_active_repeating: boolean | null
  concentration_pct: string | null
  first_invoice_date: string | null
  last_invoice_date: string | null
  last_payment_date: string | null
  rollup_currency: string | null
  computed_at: string | null
  // From customer_finance (LEFT JOIN)
  credit_hold: boolean | null
  credit_limit_cents: string | number | null
  payment_priority: number | null
  // From aggregated tag join
  tags: Array<{ id: string; label: string; color: string }> | null
  // From customer_insights (LEFT JOIN)
  churn_risk_score: number | null
  churn_risk_band: string | null
  forecast_12m_cents: string | number | null
  forecast_basis: string | null
}

function n(value: unknown): number {
  if (value == null) return 0
  const v = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(v) ? v : 0
}

function dollars(cents: unknown): number {
  return n(cents) / 100
}

function tenureDays(firstInvoiceDate: string | null): number | null {
  if (!firstInvoiceDate) return null
  const ms = Date.now() - new Date(firstInvoiceDate).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

function health(overdue: number, outstanding: number): 'overdue' | 'outstanding' | 'clear' {
  if (overdue > 0) return 'overdue'
  if (outstanding > 0) return 'outstanding'
  return 'clear'
}

function agingBucketsToDollars(buckets: Record<string, number> | null) {
  if (!buckets) return { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  return {
    current: dollars(buckets.current ?? 0),
    '1-30':  dollars(buckets['1-30'] ?? 0),
    '31-60': dollars(buckets['31-60'] ?? 0),
    '61-90': dollars(buckets['61-90'] ?? 0),
    '90+':   dollars(buckets['90+'] ?? 0),
  }
}

export default defineEventHandler(async (event) => {
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const query = getQuery(event)
  // Default: customers only. Pass ?type=all or ?type=suppliers to widen.
  const type = String(query.type ?? 'customers')

  let typeFilter = 'AND c.is_customer = true'
  if (type === 'suppliers') typeFilter = 'AND c.is_supplier = true AND c.is_customer = false'
  else if (type === 'all') typeFilter = ''

  const rows = await queryRows<RawRow>(
    `SELECT
       c.contact_id,
       c.name,
       c.email,
       c.phone,
       c.website,
       c.is_customer,
       c.is_supplier,
       c.status,
       c.default_currency,
       c.payment_terms_days,
       c.payment_terms_type,
       c.account_number,
       c.tax_number,
       c.receivable_outstanding_cents,
       c.receivable_overdue_cents,
       c.payable_outstanding_cents,
       c.payable_overdue_cents,
       r.ltv_cents,
       r.ytd_revenue_cents,
       r.last_12m_revenue_cents,
       r.last_12m_buckets,
       r.invoice_count,
       r.paid_invoice_count,
       r.avg_invoice_cents,
       r.dso_days,
       r.paid_late_pct,
       r.outstanding_cents AS outstanding_cents_rollup,
       r.overdue_cents     AS overdue_cents_rollup,
       r.oldest_overdue_days,
       r.aging_buckets,
       r.mrr_cents,
       r.has_active_repeating,
       r.concentration_pct,
       r.first_invoice_date,
       r.last_invoice_date,
       r.last_payment_date,
       r.currency_code AS rollup_currency,
       r.computed_at,
       cf.credit_hold,
       cf.credit_limit_cents,
       cf.payment_priority,
       ct.tags,
       ci.churn_risk_score,
       ci.churn_risk_band,
       ci.forecast_12m_cents,
       ci.forecast_basis
     FROM xero_contacts_cache c
     LEFT JOIN xero_customer_rollups r
            ON r.tenant_id = c.tenant_id AND r.contact_id = c.contact_id
     LEFT JOIN customer_insights ci
            ON ci.tenant_id = c.tenant_id AND ci.contact_id = c.contact_id
     LEFT JOIN customer_finance cf
            ON cf.tenant_id = c.tenant_id AND cf.contact_id = c.contact_id
     LEFT JOIN (
       SELECT a.contact_id,
              jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'color', t.color)
                        ORDER BY t.label) AS tags
         FROM customer_tag_assignments a
         JOIN customer_tags t ON t.id = a.tag_id AND t.tenant_id = a.tenant_id
         WHERE a.tenant_id = $1
         GROUP BY a.contact_id
     ) ct ON ct.contact_id = c.contact_id
     WHERE c.tenant_id = $1
       AND c.status = 'ACTIVE'
       ${typeFilter}
     ORDER BY c.name ASC`,
    [tenantId],
  )

  // Sync freshness — surface to the UI so we can show "Last synced 4m ago".
  const syncMeta = await queryOne<{ last_contact: string | null; last_invoice: string | null; last_rollup: string | null }>(
    `SELECT
       (SELECT MAX(synced_at) FROM xero_contacts_cache WHERE tenant_id = $1)::text AS last_contact,
       (SELECT MAX(synced_at) FROM xero_invoices_cache WHERE tenant_id = $1)::text AS last_invoice,
       (SELECT MAX(computed_at) FROM xero_customer_rollups WHERE tenant_id = $1)::text AS last_rollup`,
    [tenantId],
  )

  const customers = rows.map((row) => {
    // The rollup outstanding/overdue are computed from invoice cache (one
    // source of truth). Fall back to contact balances for never-invoiced
    // contacts that still carry an opening balance in Xero.
    const outstandingCents = row.outstanding_cents_rollup ?? row.receivable_outstanding_cents
    const overdueCents = row.overdue_cents_rollup ?? row.receivable_overdue_cents

    return {
      id: row.contact_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      website: row.website,
      isCustomer: row.is_customer,
      isSupplier: row.is_supplier,
      status: row.status,
      currency: row.rollup_currency || row.default_currency || 'AUD',
      accountNumber: row.account_number,
      taxNumber: row.tax_number,
      paymentTerms: row.payment_terms_days != null ? {
        days: row.payment_terms_days,
        type: row.payment_terms_type,
      } : null,

      // Live balances (from rollup, falling back to contact)
      outstanding: dollars(outstandingCents),
      overdue: dollars(overdueCents),

      // Lifetime + period revenue
      ltv: dollars(row.ltv_cents),
      ytdRevenue: dollars(row.ytd_revenue_cents),
      last12mRevenue: dollars(row.last_12m_revenue_cents),
      last12mBuckets: row.last_12m_buckets ?? [],

      // Activity
      invoiceCount: row.invoice_count ?? 0,
      paidInvoiceCount: row.paid_invoice_count ?? 0,
      avgInvoice: dollars(row.avg_invoice_cents),
      firstInvoiceDate: row.first_invoice_date,
      lastInvoiceDate: row.last_invoice_date,
      lastPaymentDate: row.last_payment_date,
      tenureDays: tenureDays(row.first_invoice_date),

      // Payment behaviour
      dsoDays: row.dso_days != null ? Number(row.dso_days) : null,
      paidLatePct: row.paid_late_pct != null ? Number(row.paid_late_pct) : null,

      // Aging
      oldestOverdueDays: row.oldest_overdue_days ?? 0,
      agingBuckets: agingBucketsToDollars(row.aging_buckets),

      // Recurring revenue
      mrr: dollars(row.mrr_cents),
      hasActiveRepeating: Boolean(row.has_active_repeating),

      // Concentration
      concentrationPct: row.concentration_pct != null ? Number(row.concentration_pct) : 0,

      // Finance overrides + tags (joined in)
      creditHold: Boolean(row.credit_hold),
      creditLimit: row.credit_limit_cents != null ? Number(row.credit_limit_cents) / 100 : null,
      paymentPriority: row.payment_priority ?? 0,
      tags: row.tags ?? [],

      // Insights (joined in)
      churnRiskScore: row.churn_risk_score ?? 0,
      churnRiskBand: (row.churn_risk_band ?? 'low') as 'low' | 'moderate' | 'high' | 'critical',
      forecast12m: row.forecast_12m_cents != null ? Number(row.forecast_12m_cents) / 100 : 0,
      forecastBasis: row.forecast_basis ?? 'unknown',

      health: health(dollars(overdueCents), dollars(outstandingCents)),
    }
  })

  // Dashboard metrics — computed from the same rows so totals tie out
  // exactly with what's visible on screen.
  let totalOutstanding = 0
  let totalOverdue = 0
  let contactsWithBalance = 0
  let totalLTV = 0
  let totalYTD = 0
  let totalMRR = 0
  let weightedDaysSum = 0
  let weightedDaysCount = 0

  for (const c of customers) {
    totalOutstanding += c.outstanding
    totalOverdue += c.overdue
    if (c.outstanding > 0) contactsWithBalance++
    totalLTV += c.ltv
    totalYTD += c.ytdRevenue
    totalMRR += c.mrr
    if (c.overdue > 0 && c.oldestOverdueDays > 0) {
      // Weight oldest_overdue_days by overdue $ — keeps a small stale
      // invoice from skewing the average.
      weightedDaysSum += c.oldestOverdueDays * c.overdue
      weightedDaysCount += c.overdue
    }
  }

  const customerCount = customers.filter(c => c.isCustomer).length
  const supplierCount = customers.filter(c => c.isSupplier).length

  return {
    customers,
    metrics: {
      total: customers.length,
      customers: customerCount,
      suppliers: supplierCount,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      contactsWithBalance,
      avgDaysPastDue: weightedDaysCount > 0
        ? Math.round((weightedDaysSum / weightedDaysCount) * 10) / 10
        : 0,
      totalLTV: Math.round(totalLTV * 100) / 100,
      totalYTD: Math.round(totalYTD * 100) / 100,
      totalMRR: Math.round(totalMRR * 100) / 100,
    },
    sync: {
      lastContact: syncMeta?.last_contact ?? null,
      lastInvoice: syncMeta?.last_invoice ?? null,
      lastRollup: syncMeta?.last_rollup ?? null,
      // Rollup is the slowest of the three to update; it's the right
      // signal for "last data refresh" in the UI.
      lastSyncedAt: syncMeta?.last_rollup ?? syncMeta?.last_invoice ?? syncMeta?.last_contact ?? null,
      isEmpty: customers.length === 0,
    },
  }
})
