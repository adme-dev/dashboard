import { requireClientAuth } from '~~/server/utils/clientAuth'
import { getClientBillingOverview } from '~~/server/utils/billing/operations'

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  setHeader(event, 'Cache-Control', 'private, max-age=30, stale-while-revalidate=120')
  return getClientBillingOverview(client.clientId)
})
