import { createError } from 'h3'
import { xeroFetch } from '../../../../utils/xeroClient'
import { getActiveTokenForSession } from '../../../../utils/tokenStore'
import { getSelectedTenant } from '../../../../utils/session'
import { dedupedXeroCall } from '../../../../utils/xeroRateLimit'

/**
 * Returns the customer-facing online invoice URL for a single AR invoice.
 *
 *   GET /api/xero/invoices/{id}/online-url
 *   → { url: "https://in.xero.com/..." }
 *
 * Backed by Xero's `GET /Invoices/{InvoiceID}/OnlineInvoice`. The URL is
 * what you paste into a chase-payment email — it lets the client view
 * and pay without a Xero login. Fetched on demand because surfacing it
 * for every row in the table would balloon the parent /invoices call.
 */
export default eventHandler(async (event) => {
  const invoiceId = getRouterParam(event, 'id')
  if (!invoiceId) {
    throw createError({ statusCode: 400, statusMessage: 'Invoice ID is required' })
  }

  const token = await getActiveTokenForSession(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  }

  const body = await dedupedXeroCall(
    `invoice-online-url:${tenantId}:${invoiceId}`,
    'invoice-online-url',
    () => xeroFetch<any>({
      accessToken: token.access_token!,
      tenantId,
      path: `Invoices/${invoiceId}/OnlineInvoice`,
    })
  )

  const url = body?.onlineInvoices?.[0]?.onlineInvoiceUrl
  if (!url) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No online invoice URL available — the invoice may be a draft or voided.'
    })
  }

  return { url }
})
