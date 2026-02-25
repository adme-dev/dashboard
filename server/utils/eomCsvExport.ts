/**
 * ADME Advertising - EOM Xero CSV Export
 *
 * Generates Xero-compatible CSV from EOM line items.
 * Uses the 27-column format from invoice-config.ts.
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import {
  XERO_CSV_HEADERS,
  rowToCSV,
  getInvoiceDate,
  getDueDate,
  formatDateForCSV,
} from '~~/server/utils/invoicing/invoice-config'
import type { XeroCSVRow } from '~~/server/utils/invoicing/invoice-config'
import type { COACode, GSTType } from '~~/server/utils/invoicing/coa-map'
import { getPaymentTermDays } from '~~/server/utils/invoicing/xero-clients'

export async function generateXeroCSV(runId: string): Promise<string> {
  // Get run info for dates
  const run = await queryOne<{ month: number; year: number }>(
    `SELECT month, year FROM eom_runs WHERE id = $1`,
    [runId],
  )
  if (!run) throw new Error('EOM run not found')

  // Get all line items grouped by client
  const items = await queryRows<{
    client_name: string
    client_code: string | null
    description: string
    quantity: number
    unit_amount: number
    account_code: string
    tax_type: string
    tracking_option1: string | null
    invoice_number: number | null
  }>(
    `SELECT client_name, client_code, description, quantity, unit_amount,
            account_code, tax_type, tracking_option1, invoice_number
     FROM eom_line_items
     WHERE run_id = $1
     ORDER BY client_name, invoice_number, description`,
    [runId],
  )

  if (items.length === 0) return ''

  const invoiceDate = getInvoiceDate(run.year, run.month)
  const reference = `${String(run.month).padStart(2, '0')}/${run.year}`

  // Build CSV rows
  const csvLines: string[] = [XERO_CSV_HEADERS.join(',')]

  for (const item of items) {
    const paymentDays = getPaymentTermDays(item.client_name)
    const dueDate = getDueDate(invoiceDate, paymentDays)

    const row: XeroCSVRow = {
      contactName: item.client_name,
      emailAddress: '',
      invoiceNumber: String(item.invoice_number || ''),
      reference,
      invoiceDate: formatDateForCSV(invoiceDate),
      dueDate: formatDateForCSV(dueDate),
      description: item.description,
      quantity: item.quantity,
      unitAmount: item.unit_amount,
      accountCode: item.account_code as COACode,
      taxType: item.tax_type as GSTType,
      trackingOption1: item.tracking_option1 || '',
      trackingOption2: item.client_name,
      currency: 'AUD',
      brandingTheme: 'ADME',
    }

    csvLines.push(rowToCSV(row))
  }

  return csvLines.join('\n')
}
