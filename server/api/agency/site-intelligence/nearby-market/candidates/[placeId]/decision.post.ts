import { requireRole } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { isUuid, requireClientTrackingAccess } from '~~/server/utils/tracking/analytics-access'
import { writeSiteIntelligenceAudit } from '~~/server/utils/siteIntelligence/audit'
import { startGovernedSiteIntelligenceCrawl } from '~~/server/utils/siteIntelligence/crawlRunner'
import { googlePlacesClientFromRuntimeConfig, GooglePlacesError } from '~~/server/utils/siteIntelligence/googlePlaces'
import {
  enforceNearbyMarketCandidateReviewLimits,
  requireNearbyMarketProviderConfiguration,
  throwNearbyMarketProviderError
} from '~~/server/utils/siteIntelligence/nearbyMarket'
import { candidateDecisionSchema } from '~~/server/utils/siteIntelligence/nearbyMarketContracts'
import {
  getNearbyMarketCandidate,
  getPrimaryClientMarketLocation,
  materializeAndLockNearbyMarketCandidate,
  updateNearbyMarketCandidateDecision
} from '~~/server/utils/siteIntelligence/nearbyMarketRepository'
import {
  createSiteIntelligenceDomain,
  findSiteIntelligenceDomainByOrigin,
  getSiteIntelligenceDomainForClient,
  getSiteIntelligenceDomainRunState,
  lockSiteIntelligenceDomainOrigin
} from '~~/server/utils/siteIntelligence/repository'
import { assertPublicSiteOrigin } from '~~/server/utils/siteIntelligence/urlPolicy'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['owner', 'admin'])
  const placeId = getRouterParam(event, 'placeId')?.trim()
  const parsed = candidateDecisionSchema.safeParse(await readBody(event))
  if (!placeId || placeId.length > 500 || !parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid candidate decision' })
  }

  const { clientId, marketLocationId, radiusKm } = parsed.data
  if (!isUuid(clientId) || !isUuid(marketLocationId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid candidate decision' })
  }
  await requireClientTrackingAccess(event, clientId)
  if (useRuntimeConfig().nearbyMarketDiscoveryEnabled !== true) {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market discovery is disabled' })
  }
  const location = await getPrimaryClientMarketLocation(clientId)
  if (!location || location.id !== marketLocationId) {
    throw createError({ statusCode: 409, statusMessage: 'Current confirmed market location required' })
  }

  const persisted = await getNearbyMarketCandidate(clientId, marketLocationId, placeId)
  const alreadyApproved = parsed.data.action === 'approve_and_index'
    && Boolean(persisted?.approvedDomainId)

  let approvedOrigin: string | null = null
  if (parsed.data.action === 'approve_and_index' && !alreadyApproved) {
    if (parsed.data.reviewerReason.length < 10) {
      throw createError({ statusCode: 400, statusMessage: 'Reviewer reason must be at least 10 characters' })
    }
    let websiteUri = parsed.data.websiteUri
    if (!websiteUri) {
      const config = requireNearbyMarketProviderConfiguration()
      await enforceNearbyMarketCandidateReviewLimits(event, user.id)
      const places = googlePlacesClientFromRuntimeConfig(config)
      try {
        const review = await places.reviewCandidateWebsite(placeId)
        if (review.placeId !== placeId) throw new GooglePlacesError('malformed_response')
        websiteUri = review.websiteUri ?? undefined
      } catch (error) {
        throwNearbyMarketProviderError(error)
      }
      if (!websiteUri) {
        throw createError({ statusCode: 400, statusMessage: 'Candidate has no public website' })
      }
    }
    try {
      approvedOrigin = await assertPublicSiteOrigin(websiteUri)
    } catch {
      throw createError({ statusCode: 400, statusMessage: 'Public HTTP(S) origin required' })
    }
  }

  const decision = await transaction(async (db) => {
    const locked = await materializeAndLockNearbyMarketCandidate(clientId, {
      marketLocationId,
      googlePlaceId: placeId,
      radiusKmAtDecision: radiusKm
    }, db)

    if (parsed.data.action === 'approve_and_index' && locked.approvedDomainId) {
      const domain = await getSiteIntelligenceDomainForClient(
        clientId,
        locked.approvedDomainId,
        db
      )
      if (!domain) throw new Error('Approved nearby market domain was not found')
      const runState = await getSiteIntelligenceDomainRunState(domain.id, db)
      return {
        candidate: locked,
        domain,
        run: runState.run,
        shouldStartCrawl: false
      }
    }

    if (parsed.data.action === 'save' || parsed.data.action === 'dismiss') {
      const dismissed = parsed.data.action === 'dismiss'
      const dismissalReason = parsed.data.action === 'dismiss'
        ? parsed.data.reviewerReason
        : null
      const candidate = await updateNearbyMarketCandidateDecision(clientId, {
        marketLocationId,
        googlePlaceId: placeId,
        state: dismissed ? 'dismissed' : 'saved',
        approvedDomainId: null,
        radiusKmAtDecision: radiusKm,
        agencyReviewReason: dismissalReason,
        reviewedAt: dismissed ? new Date().toISOString() : null,
        reviewedByUserId: dismissed ? user.id : null
      }, db)
      await writeSiteIntelligenceAudit(
        user,
        clientId,
        dismissed ? 'candidate.dismissed' : 'candidate.saved',
        'candidate',
        candidate.id,
        { marketLocationId, googlePlaceId: placeId, radiusKm, state: candidate.state },
        db
      )
      return { candidate, domain: null, run: null, shouldStartCrawl: false }
    }

    if (!approvedOrigin) {
      throw createError({ statusCode: 409, statusMessage: 'Candidate decision changed; retry review' })
    }
    const origin = approvedOrigin
    await lockSiteIntelligenceDomainOrigin(clientId, origin, 'competitor', db)
    const domain = await findSiteIntelligenceDomainByOrigin(
      clientId,
      origin,
      'competitor',
      db
    ) ?? await createSiteIntelligenceDomain(user, {
      clientId,
      lane: 'competitor',
      name: new URL(origin).hostname,
      origin,
      justification: parsed.data.reviewerReason,
      status: 'active',
      discoveryMode: 'sitemaps',
      includePatterns: [],
      excludePatterns: [],
      includeSubdomains: false,
      renderMode: 'auto',
      pageLimit: 25,
      depth: 1,
      frequency: 'manual',
      crawlPurposes: ['search'],
      aiInputAllowed: false,
      retentionDays: 30
    }, db)
    const candidate = await updateNearbyMarketCandidateDecision(clientId, {
      marketLocationId,
      googlePlaceId: placeId,
      state: 'approved',
      approvedDomainId: domain.id,
      radiusKmAtDecision: radiusKm,
      agencyReviewReason: parsed.data.reviewerReason,
      reviewedAt: new Date().toISOString(),
      reviewedByUserId: user.id
    }, db)
    await writeSiteIntelligenceAudit(
      user,
      clientId,
      'candidate.approved',
      'candidate',
      candidate.id,
      { marketLocationId, googlePlaceId: placeId, radiusKm, approvedDomainId: domain.id },
      db
    )
    const runState = await getSiteIntelligenceDomainRunState(domain.id, db)
    return {
      candidate,
      domain,
      run: runState.run,
      shouldStartCrawl: !runState.hasRun
    }
  })

  if (!decision.domain || !decision.shouldStartCrawl) {
    return {
      candidate: decision.candidate,
      domain: decision.domain,
      run: decision.run,
      crawlStart: null
    }
  }

  let crawl: Awaited<ReturnType<typeof startGovernedSiteIntelligenceCrawl>>
  try {
    crawl = await startGovernedSiteIntelligenceCrawl(
      event,
      user,
      decision.domain.id,
      'manual',
      { onlyIfNeverRun: true }
    )
  } catch {
    return {
      candidate: decision.candidate,
      domain: decision.domain,
      run: decision.run,
      crawlStart: { status: 'failed' as const, category: 'workflow_start' as const }
    }
  }
  return {
    candidate: decision.candidate,
    domain: decision.domain,
    run: crawl.run ?? decision.run,
    crawlStart: crawl.status === 'failed'
      ? { status: crawl.status, category: crawl.category }
      : { status: crawl.status }
  }
})
