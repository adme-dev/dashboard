import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = { nearbyMarketDiscoveryEnabled: true }

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: unknown) => Record<string, unknown>
  getRouterParam: (event: unknown, key: string) => string | undefined
  readBody: (event: unknown) => Promise<unknown>
  useRuntimeConfig: () => typeof runtimeConfig
  createError: (options: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getQuery = event => (event as { query?: Record<string, unknown> }).query ?? {}
testGlobal.getRouterParam = (event, key) => (event as { params?: Record<string, string> }).params?.[key]
testGlobal.readBody = async event => (event as { body?: unknown }).body
testGlobal.useRuntimeConfig = () => runtimeConfig
testGlobal.createError = options => Object.assign(new Error(options.statusMessage), options)

const mocks = vi.hoisted(() => ({
  requireClientAuth: vi.fn(),
  transaction: vi.fn(),
  getPrimaryLocation: vi.fn(),
  nominateCandidate: vi.fn(),
  writeAudit: vi.fn(),
  resolvePlaceLocation: vi.fn(),
  searchNearbyDealers: vi.fn(),
  reviewCandidateWebsite: vi.fn(),
  assertPublicSiteOrigin: vi.fn(),
  createDomain: vi.fn(),
  startCrawl: vi.fn(),
  storeObject: vi.fn(),
  indexVectors: vi.fn(),
  sendQueue: vi.fn(),
  runAi: vi.fn()
}))

const transactionExecutor = { query: vi.fn() }

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  transaction: (...args: unknown[]) => mocks.transaction(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/nearbyMarketRepository', () => ({
  getPrimaryClientMarketLocation: (...args: unknown[]) => mocks.getPrimaryLocation(...args),
  nominateNearbyMarketCandidate: (...args: unknown[]) => mocks.nominateCandidate(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/audit', () => ({
  writeSiteIntelligenceAudit: (...args: unknown[]) => mocks.writeAudit(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/googlePlaces', () => ({
  googlePlacesClientFromRuntimeConfig: () => ({
    resolvePlaceLocation: mocks.resolvePlaceLocation,
    searchNearbyDealers: mocks.searchNearbyDealers,
    reviewCandidateWebsite: mocks.reviewCandidateWebsite
  })
}))

vi.mock('~~/server/utils/siteIntelligence/urlPolicy', () => ({
  assertPublicSiteOrigin: (...args: unknown[]) => mocks.assertPublicSiteOrigin(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/repository', () => ({
  createSiteIntelligenceDomain: (...args: unknown[]) => mocks.createDomain(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/crawlRunner', () => ({
  startGovernedSiteIntelligenceCrawl: (...args: unknown[]) => mocks.startCrawl(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/storage', () => ({
  putSiteIntelligenceObject: (...args: unknown[]) => mocks.storeObject(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/vectorize', () => ({
  indexSiteIntelligenceVectors: (...args: unknown[]) => mocks.indexVectors(...args)
}))

const { default: nominationHandler } = await import(
  '../../../../../../server/api/client-portal/site-intelligence/candidates/[placeId]/nominate.post'
)
const actualRepository = await vi.importActual<
  typeof import('~~/server/utils/siteIntelligence/nearbyMarketRepository')
>('~~/server/utils/siteIntelligence/nearbyMarketRepository')

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LOCATION_ID = '22222222-2222-4222-8222-222222222222'
const FIRST_PORTAL_USER_ID = '33333333-3333-4333-8333-333333333333'
const SECOND_PORTAL_USER_ID = '44444444-4444-4444-8444-444444444444'
const CANDIDATE_ID = '55555555-5555-4555-8555-555555555555'

const portalUser = {
  id: FIRST_PORTAL_USER_ID,
  clientId: CLIENT_ID,
  role: 'admin',
  isPrimaryContact: true,
  permissions: {
    canViewAnalytics: true,
    canNominateCompetitors: true,
    canAdminCrm: true
  }
}

const marketLocation = {
  id: LOCATION_ID,
  clientId: CLIENT_ID,
  label: 'Main showroom',
  addressText: '100 Collins Street, Melbourne VIC',
  googlePlaceId: 'place-main',
  isPrimary: true,
  confirmedAt: '2026-08-01T00:00:00.000Z',
  confirmedBy: 'agency-user-id',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z'
}

const nominatedCandidate = {
  id: CANDIDATE_ID,
  clientId: CLIENT_ID,
  marketLocationId: LOCATION_ID,
  googlePlaceId: 'candidate-place',
  state: 'nominated',
  source: 'client_portal',
  approvedDomainId: null,
  radiusKmAtDecision: 25,
  nominationReason: 'A direct local competitor',
  nominatedAt: '2026-08-02T00:00:00.000Z',
  nominatedByClientUserId: FIRST_PORTAL_USER_ID,
  agencyReviewReason: null,
  reviewedAt: null,
  reviewedByUserId: null,
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z'
}

function event(input: {
  query?: Record<string, unknown>
  params?: Record<string, string>
  body?: unknown
} = {}) {
  return input as Parameters<typeof nominationHandler>[0]
}

function nominationBody(extra: Record<string, unknown> = {}) {
  return {
    marketLocationId: LOCATION_ID,
    radiusKm: 25,
    reason: '  A direct local competitor  ',
    ...extra
  }
}

beforeEach(() => {
  runtimeConfig.nearbyMarketDiscoveryEnabled = true
  vi.clearAllMocks()
  transactionExecutor.query.mockReset()
  mocks.requireClientAuth.mockResolvedValue(portalUser)
  mocks.transaction.mockImplementation(async callback => callback(transactionExecutor))
  mocks.getPrimaryLocation.mockResolvedValue(marketLocation)
  mocks.nominateCandidate.mockResolvedValue(nominatedCandidate)
  mocks.writeAudit.mockResolvedValue('audit-id')
})

describe('client portal competitor nomination', () => {
  it('rejects unauthenticated submission before location or mutation work', async () => {
    mocks.requireClientAuth.mockRejectedValue(
      Object.assign(new Error('Not authenticated'), { statusCode: 401 })
    )

    await expect(nominationHandler(event({
      params: { placeId: 'candidate-place' },
      body: nominationBody()
    }))).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it.each([
    { canViewAnalytics: false, canNominateCompetitors: true },
    { canViewAnalytics: true, canNominateCompetitors: false }
  ])('requires both explicit portal permissions: %j', async (permissions) => {
    mocks.requireClientAuth.mockResolvedValue({ ...portalUser, permissions })

    await expect(nominationHandler(event({
      params: { placeId: 'candidate-place' },
      body: nominationBody()
    }))).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it.each([
    { clientId: 'attacker-client' },
    { websiteUri: 'https://attacker.example' },
    { actorId: 'attacker-user' },
    { clientUserId: 'attacker-user' },
    { crawlPurpose: 'ai-input' },
    { pageLimit: 500 },
    { unknown: true }
  ])('strictly rejects tenant, website, actor, crawl, and unknown body fields: %j', async (extra) => {
    await expect(nominationHandler(event({
      params: { placeId: 'candidate-place' },
      body: nominationBody(extra)
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid competitor nomination'
    })
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects every query field rather than accepting a second tenant boundary', async () => {
    await expect(nominationHandler(event({
      query: { clientId: 'attacker-client' },
      params: { placeId: 'candidate-place' },
      body: nominationBody()
    }))).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled()
  })

  it.each([
    { reason: '   ' },
    { reason: 'x'.repeat(1001) },
    { reason: undefined },
    { radiusKm: 20 },
    { marketLocationId: 'not-a-uuid' }
  ])('rejects invalid bounded nomination input before persistence: %j', async (extra) => {
    await expect(nominationHandler(event({
      params: { placeId: 'candidate-place' },
      body: nominationBody(extra)
    }))).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects a mismatched current location inside the nomination transaction', async () => {
    mocks.getPrimaryLocation.mockResolvedValue({ ...marketLocation, id: SECOND_PORTAL_USER_ID })

    await expect(nominationHandler(event({
      params: { placeId: 'candidate-place' },
      body: nominationBody()
    }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Current confirmed market location required'
    })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.getPrimaryLocation).toHaveBeenCalledWith(CLIENT_ID, transactionExecutor)
    expect(mocks.nominateCandidate).not.toHaveBeenCalled()
    expect(mocks.writeAudit).not.toHaveBeenCalled()
  })

  it('rejects a non-primary location inside the nomination transaction', async () => {
    mocks.getPrimaryLocation.mockResolvedValue({ ...marketLocation, isPrimary: false })

    await expect(nominationHandler(event({
      params: { placeId: 'candidate-place' },
      body: nominationBody()
    }))).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Current confirmed market location required'
    })
    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.getPrimaryLocation).toHaveBeenCalledWith(CLIENT_ID, transactionExecutor)
    expect(mocks.nominateCandidate).not.toHaveBeenCalled()
    expect(mocks.writeAudit).not.toHaveBeenCalled()
  })

  it('upserts one scoped tuple and appends a client-actor audit in the same transaction', async () => {
    const result = await nominationHandler(event({
      params: { placeId: 'candidate-place' },
      body: nominationBody()
    }))

    expect(mocks.getPrimaryLocation).toHaveBeenCalledWith(CLIENT_ID, transactionExecutor)
    expect(mocks.nominateCandidate).toHaveBeenCalledWith(CLIENT_ID, {
      marketLocationId: LOCATION_ID,
      googlePlaceId: 'candidate-place',
      radiusKmAtDecision: 25,
      nominationReason: 'A direct local competitor',
      nominatedByClientUserId: FIRST_PORTAL_USER_ID
    }, transactionExecutor)
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      { id: null, clientUserId: FIRST_PORTAL_USER_ID },
      CLIENT_ID,
      'candidate.nominated',
      'candidate',
      CANDIDATE_ID,
      {
        marketLocationId: LOCATION_ID,
        googlePlaceId: 'candidate-place',
        radiusKm: 25,
        reason: 'A direct local competitor'
      },
      transactionExecutor
    )
    expect(result).toEqual({
      candidate: { placeId: 'candidate-place', portalState: 'under_review' }
    })
  })

  it('coalesces duplicate rows while preserving an audit event for every submission', async () => {
    const request = event({ params: { placeId: 'candidate-place' }, body: nominationBody() })

    await nominationHandler(request)
    await nominationHandler(request)

    expect(mocks.nominateCandidate).toHaveBeenCalledTimes(2)
    expect(mocks.writeAudit.mock.calls.filter(call => call[2] === 'candidate.nominated'))
      .toHaveLength(2)
    expect(mocks.writeAudit.mock.calls.map(call => call[4])).toEqual([CANDIDATE_ID, CANDIDATE_ID])
  })

  it('retains both client actors in append-only audits while the latest nomination wins', async () => {
    await nominationHandler(event({
      params: { placeId: 'candidate-place' },
      body: nominationBody({ reason: 'First actor reason' })
    }))
    mocks.requireClientAuth.mockResolvedValue({ ...portalUser, id: SECOND_PORTAL_USER_ID })
    await nominationHandler(event({
      params: { placeId: 'candidate-place' },
      body: nominationBody({ reason: 'Second actor reason' })
    }))

    expect(mocks.nominateCandidate.mock.calls.map(call => call[1])).toEqual([
      expect.objectContaining({
        nominationReason: 'First actor reason',
        nominatedByClientUserId: FIRST_PORTAL_USER_ID
      }),
      expect.objectContaining({
        nominationReason: 'Second actor reason',
        nominatedByClientUserId: SECOND_PORTAL_USER_ID
      })
    ])
    expect(mocks.writeAudit.mock.calls.map(call => call[0])).toEqual([
      { id: null, clientUserId: FIRST_PORTAL_USER_ID },
      { id: null, clientUserId: SECOND_PORTAL_USER_ID }
    ])
    expect(mocks.writeAudit.mock.calls.map(call => call[5]?.reason)).toEqual([
      'First actor reason',
      'Second actor reason'
    ])
  })

  it('never performs provider, website, URL policy, domain, crawl, storage, vector, queue, or AI work', async () => {
    await nominationHandler(event({
      params: { placeId: 'candidate-place' },
      body: nominationBody()
    }))

    expect(mocks.resolvePlaceLocation).not.toHaveBeenCalled()
    expect(mocks.searchNearbyDealers).not.toHaveBeenCalled()
    expect(mocks.reviewCandidateWebsite).not.toHaveBeenCalled()
    expect(mocks.assertPublicSiteOrigin).not.toHaveBeenCalled()
    expect(mocks.createDomain).not.toHaveBeenCalled()
    expect(mocks.startCrawl).not.toHaveBeenCalled()
    expect(mocks.storeObject).not.toHaveBeenCalled()
    expect(mocks.indexVectors).not.toHaveBeenCalled()
    expect(mocks.sendQueue).not.toHaveBeenCalled()
    expect(mocks.runAi).not.toHaveBeenCalled()
  })

  it('locks the authenticated client primary location through the supplied transaction executor', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        id: LOCATION_ID,
        client_id: CLIENT_ID,
        label: marketLocation.label,
        address_text: marketLocation.addressText,
        google_place_id: marketLocation.googlePlaceId,
        is_primary: true,
        confirmed_at: marketLocation.confirmedAt,
        confirmed_by: marketLocation.confirmedBy,
        created_at: marketLocation.createdAt,
        updated_at: marketLocation.updatedAt
      }]
    })

    await expect(actualRepository.getPrimaryClientMarketLocation(CLIENT_ID, { query }))
      .resolves.toMatchObject({ id: LOCATION_ID, clientId: CLIENT_ID, isPrimary: true })

    expect(query).toHaveBeenCalledOnce()
    expect(query.mock.calls[0]?.[0]).toMatch(
      /FROM client_market_locations[\s\S]*client_id = \$1[\s\S]*is_primary = TRUE[\s\S]*FOR UPDATE/i
    )
    expect(query.mock.calls[0]?.[1]).toEqual([CLIENT_ID])
  })

  it('updates the one tuple to the latest bounded portal nomination on conflict', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        id: CANDIDATE_ID,
        client_id: CLIENT_ID,
        market_location_id: LOCATION_ID,
        google_place_id: 'candidate-place',
        state: 'nominated',
        source: 'client_portal',
        approved_domain_id: null,
        radius_km_at_decision: 50,
        nomination_reason: 'Latest reason',
        nominated_at: '2026-08-02T01:00:00.000Z',
        nominated_by_client_user_id: SECOND_PORTAL_USER_ID,
        agency_review_reason: null,
        reviewed_at: null,
        reviewed_by_user_id: null,
        created_at: '2026-08-02T00:00:00.000Z',
        updated_at: '2026-08-02T01:00:00.000Z'
      }]
    })

    const result = await actualRepository.nominateNearbyMarketCandidate(CLIENT_ID, {
      marketLocationId: LOCATION_ID,
      googlePlaceId: 'candidate-place',
      radiusKmAtDecision: 50,
      nominationReason: 'Latest reason',
      nominatedByClientUserId: SECOND_PORTAL_USER_ID
    }, { query })

    expect(result).toMatchObject({
      id: CANDIDATE_ID,
      state: 'nominated',
      source: 'client_portal',
      nominationReason: 'Latest reason',
      nominatedByClientUserId: SECOND_PORTAL_USER_ID
    })
    expect(query).toHaveBeenCalledOnce()
    expect(query.mock.calls[0]?.[0]).toMatch(
      /INSERT INTO site_intelligence_candidates[\s\S]*ON CONFLICT \(client_id, market_location_id, google_place_id\)[\s\S]*state = 'nominated'[\s\S]*source = 'client_portal'[\s\S]*nomination_reason = EXCLUDED.nomination_reason[\s\S]*nominated_by_client_user_id = EXCLUDED.nominated_by_client_user_id/i
    )
    expect(query.mock.calls[0]?.[1]).toEqual([
      CLIENT_ID,
      LOCATION_ID,
      'candidate-place',
      50,
      'Latest reason',
      SECOND_PORTAL_USER_ID
    ])
  })
})
