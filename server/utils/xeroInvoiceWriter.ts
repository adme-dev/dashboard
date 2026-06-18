/**
 * ADME Advertising — Xero Invoice Writer
 *
 * Core utility for creating invoices in Xero via the Accounting API.
 * Handles contact validation, payload construction, batch creation,
 * and status polling.
 */

import type { H3Event } from 'h3'
import { createXeroClient } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { fetchXeroContacts, getPaymentTermDays } from '~~/server/utils/invoicing/xero-clients'
import {
  XERO_CONFIG,
  formatDateForAPI,
  getInvoiceDate,
  getDueDate,
} from '~~/server/utils/invoicing/invoice-config'
import type { XeroAPIInvoice, XeroAPILineItem } from '~~/server/utils/invoicing/invoice-config'

// ── Types ────────────────────────────────────────────────────────────────────

interface ContactValidationResult {
  matched: Array<{ clientName: string; xeroContactName: string; contactId: string }>
  unmatched: string[]
  total: number
}

interface PushResult {
  total: number
  created: number
  failed: number
  errors: Array<{ invoiceNumber: string; clientName: string; error: string }>
  batchId: string | null
}

interface InvoiceStatusResult {
  invoiceNumber: string
  status: string  // DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED
  amountDue: number
  total: number
}

// ── Contact Validation ───────────────────────────────────────────────────────

/**
 * Validates that all client names in the EOM run exist as Xero contacts.
 * Returns matched/unmatched arrays for the UI to display before pushing.
 */
export async function validateContacts(
  event: H3Event,
  runId: string,
): Promise<ContactValidationResult> {
  // Get distinct client names from the run
  const clients = await queryRows<{ client_name: string }>(
    `SELECT DISTINCT client_name FROM eom_line_items WHERE run_id = $1 ORDER BY client_name`,
    [runId],
  )

  // Fetch live contacts from Xero
  const xeroContacts = await fetchXeroContacts(event)
  const contactMap = new Map(
    xeroContacts.map(c => [c.name.toLowerCase(), c]),
  )

  const matched: ContactValidationResult['matched'] = []
  const unmatched: string[] = []

  for (const { client_name } of clients) {
    const xeroContact = contactMap.get(client_name.toLowerCase())
    if (xeroContact) {
      matched.push({
        clientName: client_name,
        xeroContactName: xeroContact.name,
        contactId: xeroContact.contactId,
      })
    } else {
      unmatched.push(client_name)
    }
  }

  return {
    matched,
    unmatched,
    total: clients.length,
  }
}

// ── Payload Builder ──────────────────────────────────────────────────────────

/**
 * Builds Xero API invoice payloads from EOM line items.
 * Groups line items by invoice_number (each number = one client = one invoice).
 */
export async function buildXeroPayload(
  runId: string,
  month: number,
  year: number,
): Promise<XeroAPIInvoice[]> {
  const items = await queryRows<{
    client_name: string
    description: string
    quantity: number
    unit_amount: number
    account_code: string
    tax_type: string
    tracking_option1: string | null
    invoice_number: number | null
  }>(
    `SELECT client_name, description, quantity, unit_amount, account_code,
            tax_type, tracking_option1, invoice_number
     FROM eom_line_items
     WHERE run_id = $1
     ORDER BY client_name, invoice_number`,
    [runId],
  )

  if (items.length === 0) return []

  // Group by invoice_number
  const grouped = new Map<number, typeof items>()
  for (const item of items) {
    const num = item.invoice_number ?? 0
    if (!grouped.has(num)) grouped.set(num, [])
    grouped.get(num)!.push(item)
  }

  const invoiceDate = getInvoiceDate(year, month)
  const reference = `${String(month).padStart(2, '0')}/${year}`

  const invoices: XeroAPIInvoice[] = []

  for (const [invoiceNumber, lineItems] of grouped) {
    const firstLineItem = lineItems[0]
    if (!firstLineItem) continue

    const clientName = firstLineItem.client_name
    const paymentTermDays = getPaymentTermDays(clientName)
    const dueDate = getDueDate(invoiceDate, paymentTermDays)

    const xeroLineItems: XeroAPILineItem[] = lineItems.map(item => ({
      Description: item.description,
      Quantity: item.quantity,
      UnitAmount: item.unit_amount,
      AccountCode: item.account_code,
      TaxType: item.tax_type,
      Tracking: [
        { Name: 'Media', Option: item.tracking_option1 || '' },
        { Name: 'Client', Option: item.client_name },
      ],
    }))

    invoices.push({
      Type: 'ACCREC',
      Contact: { Name: clientName },
      InvoiceNumber: String(invoiceNumber),
      Reference: reference,
      Date: formatDateForAPI(invoiceDate),
      DueDate: formatDateForAPI(dueDate),
      Status: 'DRAFT',
      LineAmountTypes: 'Exclusive',
      CurrencyCode: 'AUD',
      LineItems: xeroLineItems,
    })
  }

  return invoices
}

// ── Batch Create ─────────────────────────────────────────────────────────────

/**
 * Pushes invoices to Xero in batches of XERO_CONFIG.maxBatchSize (50).
 * Updates the EOM run status to 'pushed' on completion.
 */
export async function batchCreateInvoices(
  event: H3Event,
  runId: string,
  invoices: XeroAPIInvoice[],
): Promise<PushResult> {
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)

  if (!tenantId) {
    throw new Error('No Xero organization selected')
  }

  const client = await createXeroClient({ tokenSet: token, event })

  let created = 0
  const errors: PushResult['errors'] = []
  const batchId = crypto.randomUUID()

  // Split into batches
  for (let i = 0; i < invoices.length; i += XERO_CONFIG.maxBatchSize) {
    const batch = invoices.slice(i, i + XERO_CONFIG.maxBatchSize)

    try {
      const response = await (client.accountingApi.createInvoices as any)(
        tenantId,
        { Invoices: batch },
        true, // summarizeErrors
      )

      const body = response?.body || response
      const returnedInvoices = body?.invoices || body?.Invoices || []

      for (const inv of returnedInvoices) {
        if (inv.hasErrors || inv.HasErrors) {
          const validationErrors = inv.validationErrors || inv.ValidationErrors || []
          const errMsg = validationErrors.map((e: any) => e.message || e.Message).join('; ')
          errors.push({
            invoiceNumber: inv.invoiceNumber || inv.InvoiceNumber || 'unknown',
            clientName: inv.contact?.name || inv.Contact?.Name || 'unknown',
            error: errMsg || 'Unknown validation error',
          })
        } else {
          created++
        }
      }
    } catch (err: any) {
      // Entire batch failed
      for (const inv of batch) {
        errors.push({
          invoiceNumber: inv.InvoiceNumber,
          clientName: inv.Contact.Name,
          error: err.message || 'Batch request failed',
        })
      }
    }
  }

  // Update run status
  const newStatus = errors.length === 0 ? 'pushed' : (created > 0 ? 'pushed' : 'review')
  await execute(
    `UPDATE eom_runs SET status = $2, xero_batch_id = $3, updated_at = NOW() WHERE id = $1`,
    [runId, newStatus, batchId],
  )

  return {
    total: invoices.length,
    created,
    failed: errors.length,
    errors,
    batchId: created > 0 ? batchId : null,
  }
}

// ── Status Polling ───────────────────────────────────────────────────────────

/**
 * Fetches current statuses of invoices from Xero by invoice number.
 * Used to check whether DRAFT invoices have been authorised/paid.
 */
export async function getInvoiceStatuses(
  event: H3Event,
  invoiceNumbers: string[],
): Promise<InvoiceStatusResult[]> {
  if (invoiceNumbers.length === 0) return []

  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)

  if (!tenantId) {
    throw new Error('No Xero organization selected')
  }

  const client = await createXeroClient({ tokenSet: token, event })

  const results: InvoiceStatusResult[] = []

  // Xero supports filtering by InvoiceNumber — query in batches to avoid URL length issues
  const batchSize = 25
  for (let i = 0; i < invoiceNumbers.length; i += batchSize) {
    const batch = invoiceNumbers.slice(i, i + batchSize)
    const filter = batch.map(n => `InvoiceNumber=="${n}"`).join(' OR ')

    try {
      const response = await (client.accountingApi.getInvoices as any)(
        tenantId,
        undefined,  // ifModifiedSince
        filter,     // where
        'InvoiceNumber ASC', // order
      )

      const body = response?.body || response
      const invoices = body?.invoices || body?.Invoices || []

      for (const inv of invoices) {
        results.push({
          invoiceNumber: inv.invoiceNumber || inv.InvoiceNumber || '',
          status: inv.status || inv.Status || 'UNKNOWN',
          amountDue: inv.amountDue ?? inv.AmountDue ?? 0,
          total: inv.total ?? inv.Total ?? 0,
        })
      }
    } catch (err: any) {
      console.error('[EOM] Failed to fetch invoice statuses:', err.message)
      // Return partial results rather than failing entirely
    }
  }

  return results
}
