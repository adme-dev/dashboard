/**
 * GET /api/customers/export.csv
 *
 * CSV of the full customer book with rollup metrics, ready to drop into
 * Excel / accountants pack. Reads the same cache the list page reads, so
 * the numbers tie out exactly with what's on screen.
 *
 * Returns text/csv with a download-friendly Content-Disposition.
 */

import { defineEventHandler, setHeader, createError } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'

interface ExportRow {
  contact_id: string
  name: string
  email: string | null
  status: string
  is_customer: boolean
  is_supplier: boolean
  default_currency: string | null
  payment_terms_days: number | null
  ltv_cents: string | number | null
  ytd_revenue_cents: string | number | null
  outstanding_cents: string | number | null
  overdue_cents: string | number | null
  oldest_overdue_days: number | null
  dso_days: string | null
  paid_late_pct: string | null
  invoice_count: number | null
  paid_invoice_count: number | null
  mrr_cents: string | number | null
  concentration_pct: string | null
  first_invoice_date: string | null
  last_invoice_date: string | null
  last_payment_date: string | null
  credit_hold: boolean | null
  credit_limit_cents: string | number | null
}

function n(v: unknown): number {
  if (v == null) return 0
  const num = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(num) ? num : 0
}

function csvEscape(val: unknown): string {
  if (val == null) return ''
  const s = String(val)
  // Quote if it contains comma, quote, newline, or starts with formula chars
  // (= + - @ tab CR — Excel formula injection prevention).
  const formulaRisk = /^[=+\-@\t\r]/.test(s)
  if (formulaRisk || /[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function fmtMoney(cents: unknown): string {
  if (cents == null || cents === 0 || cents === '0') return ''
  return (n(cents) / 100).toFixed(2)
}

export default defineEventHandler(async (event) => {
  await requireRole(event, [...PERMISSIONS.FINANCE])

  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const rows = await queryRows<ExportRow>(
    `SELECT
       c.contact_id, c.name, c.email, c.status,
       c.is_customer, c.is_supplier,
       c.default_currency, c.payment_terms_days,
       r.ltv_cents, r.ytd_revenue_cents,
       r.outstanding_cents, r.overdue_cents, r.oldest_overdue_days,
       r.dso_days, r.paid_late_pct,
       r.invoice_count, r.paid_invoice_count,
       r.mrr_cents, r.concentration_pct,
       r.first_invoice_date, r.last_invoice_date, r.last_payment_date,
       cf.credit_hold, cf.credit_limit_cents
     FROM xero_contacts_cache c
     LEFT JOIN xero_customer_rollups r
            ON r.tenant_id = c.tenant_id AND r.contact_id = c.contact_id
     LEFT JOIN customer_finance cf
            ON cf.tenant_id = c.tenant_id AND cf.contact_id = c.contact_id
     WHERE c.tenant_id = $1 AND c.status = 'ACTIVE'
     ORDER BY r.ltv_cents DESC NULLS LAST`,
    [tenantId],
  )

  const headers = [
    'Contact ID', 'Name', 'Email', 'Type', 'Currency', 'Payment terms (days)',
    'Lifetime revenue', 'YTD revenue', 'Outstanding', 'Overdue',
    'Oldest overdue (days)', 'DSO (days)', 'Late payment %',
    'Invoice count', 'Paid invoice count',
    'MRR', 'Concentration %',
    'First invoice', 'Last invoice', 'Last payment',
    'Credit hold', 'Credit limit',
  ]

  const lines: string[] = [headers.map(csvEscape).join(',')]
  for (const r of rows) {
    const type = r.is_customer && r.is_supplier ? 'Both'
      : r.is_customer ? 'Customer'
      : r.is_supplier ? 'Supplier' : 'Contact'
    lines.push([
      r.contact_id,
      r.name,
      r.email ?? '',
      type,
      r.default_currency ?? '',
      r.payment_terms_days ?? '',
      fmtMoney(r.ltv_cents),
      fmtMoney(r.ytd_revenue_cents),
      fmtMoney(r.outstanding_cents),
      fmtMoney(r.overdue_cents),
      r.oldest_overdue_days ?? '',
      r.dso_days != null ? Number(r.dso_days).toFixed(1) : '',
      r.paid_late_pct != null ? Number(r.paid_late_pct).toFixed(1) : '',
      r.invoice_count ?? '',
      r.paid_invoice_count ?? '',
      fmtMoney(r.mrr_cents),
      r.concentration_pct != null ? Number(r.concentration_pct).toFixed(2) : '',
      r.first_invoice_date ?? '',
      r.last_invoice_date ?? '',
      r.last_payment_date ?? '',
      r.credit_hold ? 'Y' : '',
      fmtMoney(r.credit_limit_cents),
    ].map(csvEscape).join(','))
  }

  const csv = lines.join('\n') + '\n'
  const filename = `customers-${new Date().toISOString().slice(0, 10)}.csv`

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return csv
})
