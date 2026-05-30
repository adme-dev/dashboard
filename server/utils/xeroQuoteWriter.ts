/**
 * Xero Quote Writer
 *
 * Push internal quotes to Xero as DRAFT quotes, sync status back,
 * and convert accepted quotes to DRAFT invoices.
 *
 * Follows patterns from xeroInvoiceWriter.ts:
 * - Token via getActiveTokenForSession
 * - Tenant via getSelectedTenant
 * - Rate limiting via dedupedXeroCall
 * - PascalCase/camelCase response handling
 */

import type { H3Event } from 'h3'
import { createXeroClient } from '~~/server/utils/xeroClient'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { fetchXeroContacts, matchClient } from '~~/server/utils/invoicing/xero-clients'
import { dedupedXeroCall } from '~~/server/utils/xeroRateLimit'
import { mapToAccount } from '~~/server/utils/invoicing/coa-map'

// ── Types ────────────────────────────────────────────────────────────────────

interface PushQuoteResult {
  xeroQuoteId: string
  xeroQuoteNumber: string
  xeroStatus: string
}

interface SyncStatusResult {
  xeroStatus: string
  syncedAt: string
}

interface ConvertToInvoiceResult {
  xeroInvoiceId: string
  xeroInvoiceNumber: string
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]
}

// ── Push Quote to Xero ──────────────────────────────────────────────────────

/**
 * Push an internal quote to Xero as a DRAFT quote.
 * Resolves client → Xero contact, maps line items to account codes.
 */
export async function pushQuoteToXero(
  event: H3Event,
  quoteId: string
): Promise<PushQuoteResult> {
  // 1. Fetch internal quote + line items
  const quote = await queryOne(`
    SELECT
      q.*,
      c.name AS client_name,
      c.name AS client_company
    FROM quotes q
    LEFT JOIN agency_clients c ON q.client_id = c.id
    WHERE q.id = $1
  `, [quoteId])

  if (!quote) {
    throw createError({ statusCode: 404, statusMessage: 'Quote not found' })
  }

  if (quote.xero_quote_id) {
    throw createError({ statusCode: 400, statusMessage: 'Quote already pushed to Xero' })
  }

  const lineItems = await queryRows(`
    SELECT * FROM quote_line_items
    WHERE quote_id = $1
    ORDER BY sort_order, created_at
  `, [quoteId])

  if (lineItems.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Quote has no line items' })
  }

  // 2. Resolve client → Xero ContactID
  const clientName = quote.client_name || quote.client_company
  if (!clientName) {
    throw createError({ statusCode: 400, statusMessage: 'Quote has no client assigned' })
  }

  const xeroContacts = await fetchXeroContacts(event)
  const clientMatch = matchClient(clientName, xeroContacts)

  if (!clientMatch) {
    throw createError({
      statusCode: 400,
      statusMessage: `Could not match client "${clientName}" to a Xero contact`
    })
  }

  // 3. Build Xero line items with account codes
  const xeroLineItems = lineItems.map((item: any) => {
    // Use COA mapping based on item type and name
    const description = item.name || item.description || ''
    const mapping = item.item_type === 'media_spend'
      ? mapToAccount(description) // Will resolve to 330 with proper tax type
      : { code: '210', taxType: 'GST on Income' as const } // Default: Production/Service

    return {
      Description: `${item.name}${item.description ? ` - ${item.description}` : ''}`,
      Quantity: Number(item.quantity) || 1,
      UnitAmount: Number(item.unit_price) || 0,
      AccountCode: mapping.code,
      TaxType: mapping.taxType,
    }
  })

  // 4. Build Xero quote payload
  const payload = {
    Contact: { ContactID: clientMatch.contact.contactId },
    Date: formatDate(quote.valid_from || new Date()),
    ExpiryDate: formatDate(quote.valid_until || new Date()),
    Reference: quote.quote_number,
    Title: quote.title || '',
    Summary: quote.description || '',
    Status: 'DRAFT',
    LineAmountTypes: 'Exclusive',
    CurrencyCode: quote.currency || 'AUD',
    LineItems: xeroLineItems,
  }

  // 5. Push to Xero
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)

  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const client = await createXeroClient({ tokenSet: token, event })

  const response = await dedupedXeroCall(
    `push-quote:${quoteId}`,
    `Push quote ${quote.quote_number} to Xero`,
    async () => {
      return (client.accountingApi.createQuotes as any)(
        tenantId,
        { Quotes: [payload] },
        true // summarizeErrors
      )
    }
  )

  // 6. Parse response (handle PascalCase + camelCase)
  const body = response?.body || response
  const returnedQuotes = body?.quotes || body?.Quotes || []
  const xeroQuote = returnedQuotes[0]

  if (!xeroQuote) {
    throw createError({ statusCode: 500, statusMessage: 'No quote returned from Xero' })
  }

  if (xeroQuote.hasErrors || xeroQuote.HasErrors) {
    const errors = xeroQuote.validationErrors || xeroQuote.ValidationErrors || []
    const errMsg = errors.map((e: any) => e.message || e.Message).join('; ')
    throw createError({ statusCode: 400, statusMessage: `Xero validation error: ${errMsg}` })
  }

  const xeroQuoteId = xeroQuote.quoteID || xeroQuote.QuoteID
  const xeroQuoteNumber = xeroQuote.quoteNumber || xeroQuote.QuoteNumber || ''
  const xeroStatus = xeroQuote.status || xeroQuote.Status || 'DRAFT'

  // 7. Update internal quote with Xero data
  await execute(`
    UPDATE quotes
    SET xero_quote_id = $2,
        xero_quote_number = $3,
        xero_status = $4,
        xero_synced_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
  `, [quoteId, xeroQuoteId, xeroQuoteNumber, xeroStatus])

  return {
    xeroQuoteId,
    xeroQuoteNumber,
    xeroStatus,
  }
}

// ── Sync Quote Status ────────────────────────────────────────────────────────

/**
 * Fetch current status of a quote from Xero and update internal record.
 */
export async function syncQuoteStatus(
  event: H3Event,
  quoteId: string
): Promise<SyncStatusResult> {
  const quote = await queryOne(
    `SELECT xero_quote_id FROM quotes WHERE id = $1`,
    [quoteId]
  )

  if (!quote?.xero_quote_id) {
    throw createError({ statusCode: 400, statusMessage: 'Quote has not been pushed to Xero' })
  }

  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)

  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const client = await createXeroClient({ tokenSet: token, event })

  const response = await dedupedXeroCall(
    `sync-quote:${quoteId}`,
    `Sync quote status from Xero`,
    async () => {
      return (client.accountingApi.getQuote as any)(
        tenantId,
        quote.xero_quote_id
      )
    }
  )

  const body = response?.body || response
  const returnedQuotes = body?.quotes || body?.Quotes || []
  const xeroQuote = returnedQuotes[0]

  const xeroStatus = xeroQuote?.status || xeroQuote?.Status || 'UNKNOWN'
  const syncedAt = new Date().toISOString()

  await execute(`
    UPDATE quotes
    SET xero_status = $2,
        xero_synced_at = $3,
        updated_at = NOW()
    WHERE id = $1
  `, [quoteId, xeroStatus, syncedAt])

  return { xeroStatus, syncedAt }
}

// ── Convert Xero Quote to Invoice ────────────────────────────────────────────

/**
 * Convert an ACCEPTED Xero quote to a DRAFT invoice in Xero.
 * Reads the quote from Xero to get full line items, then creates the invoice.
 */
export async function convertXeroQuoteToInvoice(
  event: H3Event,
  quoteId: string
): Promise<ConvertToInvoiceResult> {
  const quote = await queryOne(`
    SELECT xero_quote_id, xero_status, xero_invoice_id
    FROM quotes WHERE id = $1
  `, [quoteId])

  if (!quote?.xero_quote_id) {
    throw createError({ statusCode: 400, statusMessage: 'Quote has not been pushed to Xero' })
  }

  if (quote.xero_invoice_id) {
    throw createError({ statusCode: 400, statusMessage: 'Quote has already been converted to an invoice' })
  }

  if (quote.xero_status !== 'ACCEPTED') {
    throw createError({
      statusCode: 400,
      statusMessage: `Quote must be ACCEPTED to convert (current: ${quote.xero_status})`
    })
  }

  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)

  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const client = await createXeroClient({ tokenSet: token, event })

  // 1. Fetch the Xero quote to get line items + contact
  const quoteResponse = await dedupedXeroCall(
    `fetch-quote-for-invoice:${quoteId}`,
    `Fetch Xero quote for invoice conversion`,
    async () => {
      return (client.accountingApi.getQuote as any)(
        tenantId,
        quote.xero_quote_id
      )
    }
  )

  const quoteBody = quoteResponse?.body || quoteResponse
  const returnedQuotes = quoteBody?.quotes || quoteBody?.Quotes || []
  const xeroQuote = returnedQuotes[0]

  if (!xeroQuote) {
    throw createError({ statusCode: 500, statusMessage: 'Could not fetch quote from Xero' })
  }

  // 2. Build invoice payload from the Xero quote data
  const contactId = xeroQuote.contact?.contactID || xeroQuote.Contact?.ContactID
  const xeroLineItems = xeroQuote.lineItems || xeroQuote.LineItems || []
  const currency = xeroQuote.currencyCode || xeroQuote.CurrencyCode || 'AUD'
  const reference = xeroQuote.reference || xeroQuote.Reference || ''

  const invoiceLineItems = xeroLineItems.map((li: any) => ({
    Description: li.description || li.Description || '',
    Quantity: li.quantity ?? li.Quantity ?? 1,
    UnitAmount: li.unitAmount ?? li.UnitAmount ?? 0,
    AccountCode: li.accountCode || li.AccountCode || '210',
    TaxType: li.taxType || li.TaxType || 'GST on Income',
  }))

  const invoicePayload = {
    Type: 'ACCREC',
    Contact: { ContactID: contactId },
    Date: formatDate(new Date()),
    DueDate: formatDate(new Date(Date.now() + 30 * 86400000)), // +30 days
    Reference: reference,
    Status: 'DRAFT',
    LineAmountTypes: 'Exclusive',
    CurrencyCode: currency,
    LineItems: invoiceLineItems,
  }

  // 3. Create invoice in Xero
  const invoiceResponse = await dedupedXeroCall(
    `create-invoice-from-quote:${quoteId}`,
    `Create invoice from accepted quote`,
    async () => {
      return (client.accountingApi.createInvoices as any)(
        tenantId,
        { Invoices: [invoicePayload] },
        true // summarizeErrors
      )
    }
  )

  const invoiceBody = invoiceResponse?.body || invoiceResponse
  const returnedInvoices = invoiceBody?.invoices || invoiceBody?.Invoices || []
  const xeroInvoice = returnedInvoices[0]

  if (!xeroInvoice) {
    throw createError({ statusCode: 500, statusMessage: 'No invoice returned from Xero' })
  }

  if (xeroInvoice.hasErrors || xeroInvoice.HasErrors) {
    const errors = xeroInvoice.validationErrors || xeroInvoice.ValidationErrors || []
    const errMsg = errors.map((e: any) => e.message || e.Message).join('; ')
    throw createError({ statusCode: 400, statusMessage: `Xero invoice error: ${errMsg}` })
  }

  const xeroInvoiceId = xeroInvoice.invoiceID || xeroInvoice.InvoiceID
  const xeroInvoiceNumber = xeroInvoice.invoiceNumber || xeroInvoice.InvoiceNumber || ''

  // 4. Update internal quote
  await execute(`
    UPDATE quotes
    SET xero_invoice_id = $2,
        xero_status = 'INVOICED',
        xero_synced_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
  `, [quoteId, xeroInvoiceId])

  return {
    xeroInvoiceId,
    xeroInvoiceNumber,
  }
}
