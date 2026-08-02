import type {
  PortalCandidateState,
  SiteIntelligenceCandidateState
} from '~~/app/types/site-intelligence'
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { enforceRateLimit } from '~~/server/utils/rateLimit'
import {
  GooglePlacesError,
  googlePlacesClientFromRuntimeConfig
} from '~~/server/utils/siteIntelligence/googlePlaces'
import {
  classifyDealer,
  haversineDistanceKm,
  requireNearbyMarketProviderConfiguration,
  throwNearbyMarketProviderError
} from '~~/server/utils/siteIntelligence/nearbyMarket'
import {
  getPrimaryClientMarketLocation,
  listNearbyMarketCandidates
} from '~~/server/utils/siteIntelligence/nearbyMarketRepository'

const DISCOVERY_NOTICE = 'Google returns up to 20 discovery candidates. Results are not exhaustive.'

const portalState: Record<SiteIntelligenceCandidateState, PortalCandidateState> = {
  nominated: 'under_review',
  approved: 'monitored',
  dismissed: 'not_selected',
  saved: 'suggested'
}

const portalNearbyMarketQuerySchema = z.object({
  radiusKm: z.enum(['10', '25', '50']).transform(value => Number(value) as 10 | 25 | 50),
  includeUsedIndependent: z.enum(['true', 'false'])
    .transform(value => value === 'true')
    .default(false),
  brand: z.string().trim().min(1).max(100).optional(),
  monitoringStatus: z.enum(['suggested', 'under_review', 'monitored', 'not_selected']).optional()
}).strict()

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Not permitted to view nearby market analytics' })
  }

  const parsed = portalNearbyMarketQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid nearby market request' })
  }

  if (useRuntimeConfig().nearbyMarketDiscoveryEnabled !== true) {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market discovery is disabled' })
  }

  const { radiusKm, includeUsedIndependent, brand, monitoringStatus } = parsed.data
  const marketLocation = await getPrimaryClientMarketLocation(client.clientId)
  if (!marketLocation) {
    return {
      marketLocation: null,
      radiusKm,
      candidates: [],
      limited: false,
      notice: DISCOVERY_NOTICE
    }
  }

  const config = requireNearbyMarketProviderConfiguration()
  const limits = [
    {
      key: `nearby-market:portal:user:${client.id}`,
      limit: 10,
      windowSeconds: 600,
      failureMode: 'closed' as const
    },
    {
      key: `nearby-market:portal:client:${client.clientId}`,
      limit: 30,
      windowSeconds: 600,
      failureMode: 'closed' as const
    },
    {
      key: 'nearby-market:org:daily',
      limit: 500,
      windowSeconds: 86400,
      failureMode: 'closed' as const
    }
  ]
  for (const limit of limits) await enforceRateLimit(event, limit)

  const places = googlePlacesClientFromRuntimeConfig(config)
  let origin: { latitude: number, longitude: number }
  let nearbyPlaces: Awaited<ReturnType<typeof places.searchNearbyDealers>>
  try {
    const resolved = await places.resolvePlaceLocation(marketLocation.googlePlaceId)
    if (resolved.placeId !== marketLocation.googlePlaceId) {
      throw new GooglePlacesError('malformed_response')
    }
    origin = resolved.location
    nearbyPlaces = await places.searchNearbyDealers({ ...origin, radiusKm })
  } catch (error) {
    throwNearbyMarketProviderError(error)
  }

  const decisions = await listNearbyMarketCandidates(
    client.clientId,
    marketLocation.id,
    nearbyPlaces.map(place => place.placeId)
  )
  const decisionByPlaceId = new Map(decisions.map(decision => [decision.googlePlaceId, decision]))
  const brandNeedle = brand?.toLocaleLowerCase('en-AU')

  const candidates = nearbyPlaces
    .map((place) => {
      const state = decisionByPlaceId.get(place.placeId)?.state ?? null
      return {
        placeId: place.placeId,
        displayName: place.displayName,
        formattedAddress: place.formattedAddress,
        location: place.location,
        distanceKm: haversineDistanceKm(origin, place.location),
        category: classifyDealer(place),
        portalState: state ? portalState[state] : 'suggested' as const,
        googleMapsUri: place.googleMapsUri
      }
    })
    .filter(candidate => includeUsedIndependent
      || (candidate.category !== 'used' && candidate.category !== 'independent'))
    .filter(candidate => monitoringStatus
      ? candidate.portalState === monitoringStatus
      : decisionByPlaceId.get(candidate.placeId)?.state !== 'dismissed')
    .filter(candidate => !brandNeedle
      || candidate.displayName.toLocaleLowerCase('en-AU').includes(brandNeedle))
    .sort((left, right) => left.distanceKm - right.distanceKm)

  return {
    marketLocation: {
      id: marketLocation.id,
      label: marketLocation.label,
      addressText: marketLocation.addressText,
      location: origin
    },
    radiusKm,
    candidates,
    limited: candidates.length === 20,
    notice: DISCOVERY_NOTICE
  }
})
