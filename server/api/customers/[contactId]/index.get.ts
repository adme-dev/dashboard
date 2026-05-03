/**
 * GET /api/customers/[contactId]
 *
 * Single-customer detail. Same enriched shape as the list endpoint plus:
 *  • last 5 invoices (for the Overview tab)
 *  • the linked agency_clients row if there is one (so the Work / Ad spend
 *    tabs can use the internal client_id without a second lookup)
 *
 * Reads everything from the cache — sub-100ms.
 */

import { defineEventHandler, getRouterParam, createError } from 'h3'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface CacheRow {
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
  contact_number: string | null
  tax_number: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
  receivable_outstanding_cents: string | number
  receivable_overdue_cents: string | number
  payable_outstanding_cents: string | number
  payable_overdue_cents: string | number
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
  agency_client_id: string | null
}

interface RecentInvoice {
  invoice_id: string
  invoice_number: string | null
  status: string
  date: string
  due_date: string | null
  fully_paid_on_date: string | null
  total_cents: string | number
  amount_due_cents: string | number
  amount_paid_cents: string | number
  currency_code: string | null
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}
function dollars(c: unknown) { return n(c) / 100 }
function tenureDays(d: string | null) {
  if (!d) return null
  const ms = Date.now() - new Date(d).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}
function agingBucketsToDollars(b: Record<string, number> | null) {
  if (!b) return { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  return {
    current: dollars(b.current ?? 0),
    '1-30':  dollars(b['1-30'] ?? 0),
    '31-60': dollars(b['31-60'] ?? 0),
    '61-90': dollars(b['61-90'] ?? 0),
    '90+':   dollars(b['90+'] ?? 0),
  }
}
function health(overdue: number, outstanding: number) {
  if (overdue > 0) return 'overdue' as const
  if (outstanding > 0) return 'outstanding' as const
  return 'clear' as const
}

export default defineEventHandler(async (event) => {
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  const contactId = getRouterParam(event, 'contactId')
  if (!contactId) {
    throw createError({ statusCode: 400, statusMessage: 'contactId required' })
  }

  const row = await queryOne<CacheRow>(
    `SELECT
       c.contact_id, c.name, c.email, c.phone, c.website,
       c.is_customer, c.is_supplier, c.status,
       c.default_currency, c.payment_terms_days, c.payment_terms_type,
       c.account_number, c.contact_number, c.tax_number,
       c.address_line1, c.address_line2, c.city, c.region, c.postal_code, c.country,
       c.receivable_outstanding_cents, c.receivable_overdue_cents,
       c.payable_outstanding_cents, c.payable_overdue_cents,
       r.ltv_cents, r.ytd_revenue_cents, r.last_12m_revenue_cents, r.last_12m_buckets,
       r.invoice_count, r.paid_invoice_count, r.avg_invoice_cents,
       r.dso_days, r.paid_late_pct,
       r.outstanding_cents AS outstanding_cents_rollup,
       r.overdue_cents     AS overdue_cents_rollup,
       r.oldest_overdue_days, r.aging_buckets,
       r.mrr_cents, r.has_active_repeating, r.concentration_pct,
       r.first_invoice_date, r.last_invoice_date, r.last_payment_date,
       r.currency_code AS rollup_currency, r.computed_at,
       ac.id AS agency_client_id
     FROM xero_contacts_cache c
     LEFT JOIN xero_customer_rollups r
            ON r.tenant_id = c.tenant_id AND r.contact_id = c.contact_id
     LEFT JOIN agency_clients ac
            ON ac.xero_contact_id = c.contact_id
     WHERE c.tenant_id = $1 AND c.contact_id = $2`,
    [tenantId, contactId],
  )

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not found in cache' })
  }

  const recent = await queryRows<RecentInvoice>(
    `SELECT invoice_id, invoice_number, status, date, due_date, fully_paid_on_date,
            total_cents, amount_due_cents, amount_paid_cents, currency_code
       FROM xero_invoices_cache
       WHERE tenant_id = $1 AND contact_id = $2 AND type = 'ACCREC'
       ORDER BY date DESC
       LIMIT 5`,
    [tenantId, contactId],
  )

  const outstandingCents = row.outstanding_cents_rollup ?? row.receivable_outstanding_cents
  const overdueCents = row.overdue_cents_rollup ?? row.receivable_overdue_cents

  return {
    customer: {
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
      contactNumber: row.contact_number,
      taxNumber: row.tax_number,
      paymentTerms: row.payment_terms_days != null ? {
        days: row.payment_terms_days,
        type: row.payment_terms_type,
      } : null,
      address: row.address_line1 || row.city ? {
        line1: row.address_line1,
        line2: row.address_line2,
        city: row.city,
        region: row.region,
        postalCode: row.postal_code,
        country: row.country,
      } : null,
      outstanding: dollars(outstandingCents),
      overdue: dollars(overdueCents),
      ltv: dollars(row.ltv_cents),
      ytdRevenue: dollars(row.ytd_revenue_cents),
      last12mRevenue: dollars(row.last_12m_revenue_cents),
      last12mBuckets: row.last_12m_buckets ?? [],
      invoiceCount: row.invoice_count ?? 0,
      paidInvoiceCount: row.paid_invoice_count ?? 0,
      avgInvoice: dollars(row.avg_invoice_cents),
      firstInvoiceDate: row.first_invoice_date,
      lastInvoiceDate: row.last_invoice_date,
      lastPaymentDate: row.last_payment_date,
      tenureDays: tenureDays(row.first_invoice_date),
      dsoDays: row.dso_days != null ? Number(row.dso_days) : null,
      paidLatePct: row.paid_late_pct != null ? Number(row.paid_late_pct) : null,
      oldestOverdueDays: row.oldest_overdue_days ?? 0,
      agingBuckets: agingBucketsToDollars(row.aging_buckets),
      mrr: dollars(row.mrr_cents),
      hasActiveRepeating: Boolean(row.has_active_repeating),
      concentrationPct: row.concentration_pct != null ? Number(row.concentration_pct) : 0,
      health: health(dollars(overdueCents), dollars(outstandingCents)),
      // Internal linkage — null if this Xero contact has never been mirrored.
      agencyClientId: row.agency_client_id,
    },
    recentInvoices: recent.map(i => ({
      id: i.invoice_id,
      invoiceNumber: i.invoice_number,
      status: i.status,
      date: i.date,
      dueDate: i.due_date,
      paidDate: i.fully_paid_on_date,
      total: dollars(i.total_cents),
      amountDue: dollars(i.amount_due_cents),
      amountPaid: dollars(i.amount_paid_cents),
      currency: i.currency_code || row.rollup_currency || 'AUD',
    })),
  }
})
