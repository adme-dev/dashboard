import { requireClientAuth } from '~~/server/utils/clientAuth'
import { getClientBillingOverview } from '~~/server/utils/billing/operations'

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)

  if (!client.permissions.canViewInvoices) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have permission to view invoices'
    })
  }

  setHeader(event, 'Cache-Control', 'private, no-store')
  return getClientBillingOverview(client.clientId)
})
