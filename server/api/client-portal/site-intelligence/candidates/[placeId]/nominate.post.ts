import { requireClientAuth } from '~~/server/utils/clientAuth'
import { transaction } from '~~/server/utils/db'
import { writeSiteIntelligenceAudit } from '~~/server/utils/siteIntelligence/audit'
import { portalNominationSchema } from '~~/server/utils/siteIntelligence/nearbyMarketContracts'
import {
  getPrimaryClientMarketLocation,
  nominateNearbyMarketCandidate
} from '~~/server/utils/siteIntelligence/nearbyMarketRepository'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Not permitted to view nearby market analytics' })
  }
  if (!client.permissions.canNominateCompetitors) {
    throw createError({ statusCode: 403, statusMessage: 'Not permitted to nominate competitors' })
  }

  const placeId = getRouterParam(event, 'placeId')?.trim()
  const parsed = portalNominationSchema.safeParse(await readBody(event))
  if (Object.keys(getQuery(event)).length > 0 || !placeId || placeId.length > 500 || !parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid competitor nomination' })
  }

  if (useRuntimeConfig().nearbyMarketDiscoveryEnabled !== true) {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market discovery is disabled' })
  }

  const { marketLocationId, radiusKm, reason } = parsed.data
  const marketLocation = await getPrimaryClientMarketLocation(client.clientId)
  if (!marketLocation || marketLocation.id !== marketLocationId) {
    throw createError({ statusCode: 409, statusMessage: 'Current confirmed market location required' })
  }

  await transaction(async (db) => {
    const candidate = await nominateNearbyMarketCandidate(client.clientId, {
      marketLocationId,
      googlePlaceId: placeId,
      radiusKmAtDecision: radiusKm,
      nominationReason: reason,
      nominatedByClientUserId: client.id
    }, db)
    await writeSiteIntelligenceAudit(
      { id: null, clientUserId: client.id },
      client.clientId,
      'candidate.nominated',
      'candidate',
      candidate.id,
      { marketLocationId, googlePlaceId: placeId, radiusKm, reason },
      db
    )
  })

  return {
    candidate: {
      placeId,
      portalState: 'under_review' as const
    }
  }
})
