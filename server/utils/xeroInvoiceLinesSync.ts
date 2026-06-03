/**
 * Sync Xero invoice line items (ACCREC revenue + ACCPAY cost) into
 * xero_invoice_lines_cache.
 *
 * Pulls full invoices (line items included — Xero returns them unless
 * summaryOnly), normalises each line (ex-GST/GST + account code + tracking),
 * and replaces the lines for every synced invoice atomically so re-runs are
 * idempotent and pick up edits/deletes.
 *
 * The pure shaping lives in xeroInvoiceLines.ts; this module only does I/O.
 */

import { xeroFetch } from './xeroClient'
import { toXeroDateTime } from './xeroDataFetcher'
import { transaction } from './db'
import { normalizeInvoiceLines, type InvoiceLineRow } from './xeroInvoiceLines'

export interface SyncInvoiceLinesResult {
  invoices: number
  lines: number
  byType: Record<string, number>
}

const INSERT_COLS = 16

async function fetchInvoices(
  accessToken: string,
  tenantId: string,
  type: 'ACCREC' | 'ACCPAY',
  fromDate: Date,
  toDate?: Date,
): Promise<any[]> {
  const all: any[] = []
  const bounds = `Date>=${toXeroDateTime(fromDate)}` + (toDate ? `&&Date<${toXeroDateTime(toDate)}` : '')
  const where = `Type=="${type}"&&${bounds}&&Status!="DRAFT"&&Status!="DELETED"&&Status!="VOIDED"`
  for (let page = 1; page <= 60; page++) {
    const params = new URLSearchParams({ where, order: 'Date DESC', page: String(page), pageSize: '100' })
    const body = await xeroFetch<any>({ accessToken, tenantId, path: `Invoices?${params.toString()}` })
    const batch = body?.invoices ?? []
    all.push(...batch)
    if (batch.length < 100) break
  }
  return all
}

export async function syncInvoiceLines(opts: {
  accessToken: string
  tenantId: string
  fromDate: Date
  toDate?: Date
  types?: Array<'ACCREC' | 'ACCPAY'>
}): Promise<SyncInvoiceLinesResult> {
  const types = opts.types ?? ['ACCREC', 'ACCPAY']
  const byType: Record<string, number> = {}
  const allRows: InvoiceLineRow[] = []
  const invoiceIds = new Set<string>()

  for (const type of types) {
    const invs = await fetchInvoices(opts.accessToken, opts.tenantId, type, opts.fromDate, opts.toDate)
    byType[type] = invs.length
    for (const inv of invs) {
      for (const row of normalizeInvoiceLines(inv)) {
        allRows.push(row)
        invoiceIds.add(row.invoiceId)
      }
    }
  }

  if (invoiceIds.size === 0) return { invoices: 0, lines: 0, byType }

  await transaction(async (db) => {
    // Replace all lines for every synced invoice (idempotent; drops removed lines).
    const ids = [...invoiceIds]
    for (let i = 0; i < ids.length; i += 500) {
      await db.query(
        `DELETE FROM xero_invoice_lines_cache WHERE tenant_id = $1 AND invoice_id = ANY($2)`,
        [opts.tenantId, ids.slice(i, i + 500)],
      )
    }

    for (let i = 0; i < allRows.length; i += 400) {
      const chunk = allRows.slice(i, i + 400)
      const values: any[] = []
      const placeholders = chunk.map((r, j) => {
        const b = j * INSERT_COLS
        values.push(
          opts.tenantId, r.invoiceId, r.lineItemId, r.accountCode, r.taxType, r.description,
          r.quantity, r.unitAmountCents, r.lineExGstCents, r.taxAmountCents,
          r.trackingMedia, r.trackingClient, r.invoiceDate, r.invoiceStatus, r.invoiceType, r.contactName,
        )
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16})`
      }).join(',')

      await db.query(
        `INSERT INTO xero_invoice_lines_cache
           (tenant_id, invoice_id, line_item_id, account_code, tax_type, description,
            quantity, unit_amount_cents, line_ex_gst_cents, tax_amount_cents,
            tracking_media, tracking_client, invoice_date, invoice_status, invoice_type, contact_name)
         VALUES ${placeholders}
         ON CONFLICT (tenant_id, line_item_id) DO UPDATE SET
           account_code = EXCLUDED.account_code, tax_type = EXCLUDED.tax_type, description = EXCLUDED.description,
           quantity = EXCLUDED.quantity, unit_amount_cents = EXCLUDED.unit_amount_cents,
           line_ex_gst_cents = EXCLUDED.line_ex_gst_cents, tax_amount_cents = EXCLUDED.tax_amount_cents,
           tracking_media = EXCLUDED.tracking_media, tracking_client = EXCLUDED.tracking_client,
           invoice_date = EXCLUDED.invoice_date, invoice_status = EXCLUDED.invoice_status,
           invoice_type = EXCLUDED.invoice_type, contact_name = EXCLUDED.contact_name, synced_at = NOW()`,
        values,
      )
    }
  })

  return { invoices: invoiceIds.size, lines: allRows.length, byType }
}
