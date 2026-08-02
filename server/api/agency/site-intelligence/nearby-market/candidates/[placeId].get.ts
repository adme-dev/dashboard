import { requireRole } from '~~/server/utils/auth'
import { isUuid, requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { googlePlacesClientFromRuntimeConfig, GooglePlacesError } from '~~/server/utils/siteIntelligence/googlePlaces'
import {
  enforceNearbyMarketCandidateReviewLimits,
  requireNearbyMarketProviderConfiguration,
  throwNearbyMarketProviderError
} from '~~/server/utils/siteIntelligence/nearbyMarket'
import { getPrimaryClientMarketLocation } from '~~/server/utils/siteIntelligence/nearbyMarketRepository'
import { findSiteIntelligenceDomainByOrigin } from '~~/server/utils/siteIntelligence/repository'
import { assertPublicSiteOrigin } from '~~/server/utils/siteIntelligence/urlPolicy'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const query = getQuery(event)
  const clientId = typeof query.clientId === 'string' ? query.clientId : undefined
  const marketLocationId = typeof query.marketLocationId === 'string'
    ? query.marketLocationId
    : undefined
  const placeId = getRouterParam(event, 'placeId')?.trim()
  if (!clientId || !marketLocationId || !isUuid(clientId) || !isUuid(marketLocationId)
    || !placeId || placeId.length > 500) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid candidate review request' })
  }

  await requireClientTrackingAccess(event, clientId)
  const config = requireNearbyMarketProviderConfiguration()
  const location = await getPrimaryClientMarketLocation(clientId)
  if (!location || location.id !== marketLocationId) {
    throw createError({ statusCode: 409, statusMessage: 'Current confirmed market location required' })
  }

  await enforceNearbyMarketCandidateReviewLimits(event, user.id)
  const places = googlePlacesClientFromRuntimeConfig(config)
  let review: Awaited<ReturnType<typeof places.reviewCandidateWebsite>>
  try {
    review = await places.reviewCandidateWebsite(placeId)
    if (review.placeId !== placeId) throw new GooglePlacesError('malformed_response')
  } catch (error) {
    throwNearbyMarketProviderError(error)
  }

  if (!review.websiteUri) {
    return {
      placeId,
      displayName: review.displayName,
      websiteUri: null,
      canonicalOrigin: null,
      existingDomainId: null,
      canApprove: false
    }
  }

  let canonicalOrigin: string
  try {
    canonicalOrigin = await assertPublicSiteOrigin(review.websiteUri)
  } catch {
    return {
      placeId,
      displayName: review.displayName,
      websiteUri: null,
      canonicalOrigin: null,
      existingDomainId: null,
      canApprove: false
    }
  }

  const existing = await findSiteIntelligenceDomainByOrigin(
    clientId,
    canonicalOrigin,
    'competitor'
  )
  return {
    placeId,
    displayName: review.displayName,
    websiteUri: review.websiteUri,
    canonicalOrigin,
    existingDomainId: existing?.id ?? null,
    canApprove: true
  }
})
