import { requireRole } from '~~/server/utils/auth'
import { getClientBillingOverview } from '~~/server/utils/billing/operations'

export default defineEventHandler(async event => {
  await requireRole(event, ['owner', 'admin'])
  const clientId = getRouterParam(event, 'id')
  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required' })
  }
  setHeader(event, 'Cache-Control', 'private, no-store')
  return getClientBillingOverview(clientId, true)
})
