import { requireRole } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import {
  GooglePlacesError,
  googlePlacesClientFromRuntimeConfig
} from '~~/server/utils/siteIntelligence/googlePlaces'
import { marketLocationUpdateSchema } from '~~/server/utils/siteIntelligence/nearbyMarketContracts'
import { upsertPrimaryClientMarketLocation } from '~~/server/utils/siteIntelligence/nearbyMarketRepository'
import { writeSiteIntelligenceAudit } from '~~/server/utils/siteIntelligence/audit'

const LOCATION_ADMIN_ROLES = ['owner', 'admin'] as const

function requireNearbyMarketConfiguration() {
  const config = useRuntimeConfig()
  if (config.nearbyMarketDiscoveryEnabled !== true) {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market discovery is disabled' })
  }
  if (typeof config.googlePlacesServerApiKey !== 'string' || !config.googlePlacesServerApiKey.trim()) {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market provider is not configured' })
  }
  return config
}

function throwNearbyProviderError(error: unknown): never {
  if (!(error instanceof GooglePlacesError)) {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market provider is unavailable' })
  }
  if (error.code === 'not_configured' || error.code === 'auth') {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market provider is misconfigured' })
  }
  if (error.code === 'rate_limited') {
    throw createError({ statusCode: 429, statusMessage: 'Nearby market provider is rate-limited' })
  }
  if (error.code === 'quota') {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market provider quota is exhausted' })
  }
  if (error.code === 'invalid_request' || error.code === 'malformed_response') {
    throw createError({ statusCode: 502, statusMessage: 'Nearby market provider returned an invalid response' })
  }
  throw createError({ statusCode: 503, statusMessage: 'Nearby market provider is unavailable' })
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, LOCATION_ADMIN_ROLES)
  const clientId = getRouterParam(event, 'id')
  await requireClientTrackingAccess(event, clientId)

  const parsed = marketLocationUpdateSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid market location update' })
  }

  const config = requireNearbyMarketConfiguration()
  const places = googlePlacesClientFromRuntimeConfig(config)

  if (parsed.data.action === 'preview') {
    try {
      const choices = await places.previewAddress(parsed.data.addressText)
      return { choices: choices.slice(0, 5) }
    } catch (error) {
      throwNearbyProviderError(error)
    }
  }

  let resolvedPlaceId: string
  try {
    const resolved = await places.resolvePlaceLocation(parsed.data.placeId)
    if (resolved.placeId !== parsed.data.placeId) {
      throw new GooglePlacesError('malformed_response')
    }
    resolvedPlaceId = resolved.placeId
  } catch (error) {
    throwNearbyProviderError(error)
  }

  const marketLocation = await transaction(async (db) => {
    const saved = await upsertPrimaryClientMarketLocation(clientId!, {
      label: parsed.data.label,
      addressText: parsed.data.addressText,
      googlePlaceId: resolvedPlaceId,
      confirmedBy: user.id
    }, db)

    await writeSiteIntelligenceAudit(
      user,
      clientId!,
      'market_location.confirmed',
      'market_location',
      saved.id,
      { googlePlaceId: resolvedPlaceId, label: parsed.data.label },
      db
    )
    return saved
  })

  return { marketLocation }
})
