import { requireRole } from '~~/server/utils/auth'
import { isUuid, requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { listNearbyMarketNominations } from '~~/server/utils/siteIntelligence/nearbyMarketRepository'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const query = getQuery(event)
  const clientId = typeof query.clientId === 'string' ? query.clientId : undefined
  if (clientId !== undefined) {
    if (!isUuid(clientId)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid clientId' })
    }
    await requireClientTrackingAccess(event, clientId)
  }
  const nominations = await listNearbyMarketNominations(clientId)
  return { nominations }
})
