import { createError, eventHandler, readBody } from 'h3'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { xeroFetch } from '../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../utils/tokenStore'
import { getSelectedTenant } from '../../../utils/session'

/**
 * POST /api/xero/invoice-builder/create
 *
 * Creates a single invoice in Xero from the Invoice Builder UI.
 * Accepts the full invoice payload and pushes it to Xero as DRAFT.
 */

export default eventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, [...PERMISSIONS.FINANCE])
  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const body = await readBody(event)

  if (!body?.contact?.name) {
    throw createError({ statusCode: 400, statusMessage: 'Contact name is required' })
  }
  if (!body?.lineItems?.length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one line item is required' })
  }

  // Validate line items
  for (const item of body.lineItems) {
    if (!item.description || item.quantity == null || item.unitAmount == null) {
      throw createError({ statusCode: 400, statusMessage: 'Each line item requires description, quantity, and unitAmount' })
    }
  }

  const payload = {
    Type: body.type || 'ACCREC',
    Contact: { Name: body.contact.name },
    ...(body.invoiceNumber ? { InvoiceNumber: body.invoiceNumber } : {}),
    ...(body.reference ? { Reference: body.reference } : {}),
    Date: body.date || new Date().toISOString().slice(0, 10),
    ...(body.dueDate ? { DueDate: body.dueDate } : {}),
    Status: body.status || 'DRAFT',
    LineAmountTypes: body.lineAmountTypes || 'Exclusive',
    CurrencyCode: body.currencyCode || 'AUD',
    LineItems: body.lineItems.map((item: any) => ({
      Description: item.description,
      Quantity: item.quantity,
      UnitAmount: item.unitAmount,
      AccountCode: item.accountCode,
      TaxType: item.taxType,
      ...(item.tracking ? { Tracking: item.tracking.map((t: any) => ({
        Name: t.name,
        Option: t.option,
      })) } : {}),
    })),
  }

  const result = await xeroFetch<any>({
    accessToken: token.access_token!,
    tenantId,
    path: 'Invoices',
    method: 'POST',
    body: { Invoices: [payload] },
    timeoutMs: 15000,
    raw: true,
  })

  const invoice = result?.Invoices?.[0] || result?.invoices?.[0]
  if (!invoice) {
    throw createError({ statusCode: 502, statusMessage: 'Xero did not return an invoice' })
  }

  return {
    invoiceID: invoice.InvoiceID || invoice.invoiceID,
    invoiceNumber: invoice.InvoiceNumber || invoice.invoiceNumber,
    status: invoice.Status || invoice.status,
    total: invoice.Total || invoice.total,
  }
})
