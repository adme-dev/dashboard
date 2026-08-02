import type {
  NearbyMarketCandidate,
  PortalCandidateState,
  SiteIntelligenceCandidateState
} from '~~/app/types/site-intelligence'
import { enforceRateLimit } from '~~/server/utils/rateLimit'
import { requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
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
import { nearbySearchSchema } from '~~/server/utils/siteIntelligence/nearbyMarketContracts'
import {
  getPrimaryClientMarketLocation,
  listNearbyMarketCandidates
} from '~~/server/utils/siteIntelligence/nearbyMarketRepository'

const DISCOVERY_NOTICE = 'Google returns up to 20 discovery candidates. Results are not exhaustive.'

const PORTAL_STATE: Record<SiteIntelligenceCandidateState, PortalCandidateState> = {
  saved: 'suggested',
  nominated: 'under_review',
  approved: 'monitored',
  dismissed: 'not_selected'
}

export default defineEventHandler(async (event) => {
  const parsed = nearbySearchSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid nearby market search' })
  }

  const { clientId, radiusKm, includeUsedIndependent, brand, monitoringStatus } = parsed.data
  const user = await requireClientTrackingAccess(event, clientId)
  const config = requireNearbyMarketProviderConfiguration()
  const marketLocation = await getPrimaryClientMarketLocation(clientId)

  if (!marketLocation) {
    return {
      clientId,
      marketLocation: null,
      radiusKm,
      candidates: [],
      limited: false,
      notice: DISCOVERY_NOTICE
    }
  }

  const limits = [
    { key: `nearby-market:agency:user:${user.id}`, limit: 30, windowSeconds: 600, failureMode: 'closed' as const },
    { key: `nearby-market:agency:client:${clientId}`, limit: 60, windowSeconds: 600, failureMode: 'closed' as const },
    { key: 'nearby-market:org:daily', limit: 500, windowSeconds: 86400, failureMode: 'closed' as const }
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
    clientId,
    marketLocation.id,
    nearbyPlaces.map(place => place.placeId)
  )
  const decisionByPlaceId = new Map(decisions.map(decision => [decision.googlePlaceId, decision]))
  const brandNeedle = brand?.toLocaleLowerCase('en-AU')

  const candidates = nearbyPlaces
    .map((place): NearbyMarketCandidate => {
      const decision = decisionByPlaceId.get(place.placeId)
      const state = decision?.state ?? null
      return {
        placeId: place.placeId,
        displayName: place.displayName,
        formattedAddress: place.formattedAddress,
        location: place.location,
        distanceKm: haversineDistanceKm(origin, place.location),
        category: classifyDealer(place),
        state,
        source: decision?.source ?? null,
        approvedDomainId: decision?.approvedDomainId ?? null,
        portalState: state ? PORTAL_STATE[state] : null
      }
    })
    .filter(candidate => includeUsedIndependent
      || (candidate.category !== 'used' && candidate.category !== 'independent'))
    .filter(candidate => monitoringStatus
      ? candidate.state === monitoringStatus
      : candidate.state !== 'dismissed')
    .filter(candidate => !brandNeedle
      || candidate.displayName.toLocaleLowerCase('en-AU').includes(brandNeedle))
    .sort((left, right) => left.distanceKm - right.distanceKm)

  return {
    clientId,
    marketLocation,
    radiusKm,
    candidates,
    limited: candidates.length === 20,
    notice: DISCOVERY_NOTICE
  }
})
