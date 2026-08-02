import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { getPrimaryClientMarketLocation } from '~~/server/utils/siteIntelligence/nearbyMarketRepository'

function requireNearbyMarketConfiguration() {
  const config = useRuntimeConfig()
  if (config.nearbyMarketDiscoveryEnabled !== true) {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market discovery is disabled' })
  }
  if (typeof config.googlePlacesServerApiKey !== 'string' || !config.googlePlacesServerApiKey.trim()) {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market provider is not configured' })
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clientId = typeof query.clientId === 'string' ? query.clientId : undefined

  await requireClientTrackingAccess(event, clientId)
  requireNearbyMarketConfiguration()

  return {
    marketLocation: await getPrimaryClientMarketLocation(clientId!)
  }
})
