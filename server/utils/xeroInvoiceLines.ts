/**
 * Pure normaliser: a Xero invoice (ACCREC or ACCPAY) → flat line rows ready for
 * xero_invoice_lines_cache.
 *
 * The key derivation is ex-GST per line, which depends on the invoice-level
 * LineAmountTypes:
 *   Inclusive → LineAmount already includes tax → ex-GST = LineAmount − TaxAmount
 *   Exclusive → LineAmount excludes tax         → ex-GST = LineAmount
 *   NoTax     → ex-GST = LineAmount, tax = 0
 *
 * Tracking: a line can carry up to 2 tracking categories. We pick out ADME's
 * 'Media' and 'Client' dimensions by category name.
 */

export interface InvoiceLineRow {
  invoiceId: string
  lineItemId: string
  accountCode: string | null
  taxType: string | null
  description: string | null
  quantity: number
  unitAmountCents: number
  lineExGstCents: number
  taxAmountCents: number
  trackingMedia: string | null
  trackingClient: string | null
  invoiceDate: string // YYYY-MM-DD
  invoiceStatus: string
  invoiceType: string
  contactName: string | null
}

function num(v: unknown): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

const cents = (n: number) => Math.round(n * 100)

function isoDate(v: unknown): string {
  if (!v) return ''
  return String(v).slice(0, 10)
}

function trackingOption(tracking: any[], categoryNameRe: RegExp): string | null {
  const hit = (tracking ?? []).find((t: any) => categoryNameRe.test(String(t?.name ?? '')))
  const opt = hit?.option
  return opt == null || opt === '' ? null : String(opt)
}

export function normalizeInvoiceLines(invoice: any): InvoiceLineRow[] {
  const invoiceId = String(invoice?.invoiceID ?? invoice?.invoiceId ?? '')
  if (!invoiceId) return []

  const lat = String(invoice?.lineAmountTypes ?? '').toUpperCase()
  const inclusive = lat.includes('INCL')

  const invoiceDate = isoDate(invoice?.date)
  const invoiceStatus = String(invoice?.status ?? '').toUpperCase()
  const invoiceType = String(invoice?.type ?? '').toUpperCase()
  const contactName = invoice?.contact?.name ? String(invoice.contact.name) : null

  const lines: InvoiceLineRow[] = []
  const items = invoice?.lineItems ?? []
  items.forEach((li: any, idx: number) => {
    const lineAmount = num(li?.lineAmount)
    const taxAmount = num(li?.taxAmount)
    const exGst = inclusive ? lineAmount - taxAmount : lineAmount

    lines.push({
      invoiceId,
      lineItemId: String(li?.lineItemID ?? li?.lineItemId ?? `${invoiceId}:${idx}`),
      accountCode: li?.accountCode ? String(li.accountCode) : null,
      taxType: li?.taxType ? String(li.taxType) : null,
      description: li?.description != null ? String(li.description) : null,
      quantity: num(li?.quantity),
      unitAmountCents: cents(num(li?.unitAmount)),
      lineExGstCents: cents(exGst),
      taxAmountCents: cents(taxAmount),
      trackingMedia: trackingOption(li?.tracking, /media/i),
      trackingClient: trackingOption(li?.tracking, /client/i),
      invoiceDate,
      invoiceStatus,
      invoiceType,
      contactName,
    })
  })
  return lines
}
