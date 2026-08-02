import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = {
  nearbyMarketDiscoveryEnabled: true,
  googlePlacesServerApiKey: 'server-places-key'
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: unknown) => Record<string, unknown>
  useRuntimeConfig: () => typeof runtimeConfig
  createError: (options: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getQuery = event => (event as { query?: Record<string, unknown> }).query ?? {}
testGlobal.useRuntimeConfig = () => runtimeConfig
testGlobal.createError = options => Object.assign(new Error(options.statusMessage), options)

const mocks = vi.hoisted(() => ({
  requireClientAuth: vi.fn(),
  getPrimaryLocation: vi.fn(),
  listCandidates: vi.fn(),
  enforceRateLimit: vi.fn(),
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

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mocks.requireClientAuth(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/nearbyMarketRepository', () => ({
  getPrimaryClientMarketLocation: (...args: unknown[]) => mocks.getPrimaryLocation(...args),
  listNearbyMarketCandidates: (...args: unknown[]) => mocks.listCandidates(...args)
}))

vi.mock('~~/server/utils/rateLimit', () => ({
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/googlePlaces', () => ({
  GooglePlacesError: class GooglePlacesError extends Error {
    constructor(public readonly code: string) {
      super(`sensitive provider response: ${code}`)
    }
  },
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

const { default: nearbyMarketHandler } = await import(
  '../../../../server/api/client-portal/site-intelligence/nearby-market.get'
)

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LOCATION_ID = '22222222-2222-4222-8222-222222222222'
const PORTAL_USER_ID = '33333333-3333-4333-8333-333333333333'

const portalUser = {
  id: PORTAL_USER_ID,
  clientId: CLIENT_ID,
  permissions: {
    canViewAnalytics: true,
    canNominateCompetitors: true
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

const providerCandidates = [
  {
    placeId: 'place-toyota',
    displayName: 'City Toyota',
    formattedAddress: '1 Toyota Road',
    location: { latitude: -37.804, longitude: 144.9631 },
    businessStatus: 'OPERATIONAL',
    primaryType: 'car_dealer',
    types: ['car_dealer'],
    googleMapsUri: 'https://maps.google.test/toyota'
  },
  {
    placeId: 'place-local',
    displayName: 'Local Motors',
    formattedAddress: '2 Local Road',
    location: { latitude: -37.794, longitude: 144.9631 },
    businessStatus: 'OPERATIONAL',
    primaryType: 'car_dealer',
    types: ['car_dealer'],
    googleMapsUri: 'https://maps.google.test/local'
  },
  {
    placeId: 'place-used',
    displayName: 'Quality Used Cars',
    formattedAddress: '3 Used Road',
    location: { latitude: -37.784, longitude: 144.9631 },
    businessStatus: 'OPERATIONAL',
    primaryType: 'car_dealer',
    types: ['car_dealer'],
    googleMapsUri: 'https://maps.google.test/used'
  },
  {
    placeId: 'place-saved',
    displayName: 'Saved Used Motors',
    formattedAddress: '3A Saved Road',
    location: { latitude: -37.779, longitude: 144.9631 },
    businessStatus: 'OPERATIONAL',
    primaryType: 'car_dealer',
    types: ['car_dealer'],
    googleMapsUri: 'https://maps.google.test/saved'
  },
  {
    placeId: 'place-dismissed',
    displayName: 'Suburban Mazda',
    formattedAddress: '4 Mazda Road',
    location: { latitude: -37.774, longitude: 144.9631 },
    businessStatus: 'OPERATIONAL',
    primaryType: 'car_dealer',
    types: ['car_dealer'],
    googleMapsUri: 'https://maps.google.test/mazda'
  }
]

const persistedCandidates = [
  {
    id: 'candidate-toyota',
    clientId: CLIENT_ID,
    marketLocationId: LOCATION_ID,
    googlePlaceId: 'place-toyota',
    state: 'approved',
    source: 'agency',
    approvedDomainId: 'private-domain-id',
    agencyReviewReason: 'internal agency reason'
  },
  {
    id: 'candidate-local',
    clientId: CLIENT_ID,
    marketLocationId: LOCATION_ID,
    googlePlaceId: 'place-local',
    state: 'nominated',
    source: 'client_portal',
    approvedDomainId: null,
    nominationReason: 'private nomination reason'
  },
  {
    id: 'candidate-saved',
    clientId: CLIENT_ID,
    marketLocationId: LOCATION_ID,
    googlePlaceId: 'place-saved',
    state: 'saved',
    source: 'agency',
    approvedDomainId: null
  },
  {
    id: 'candidate-dismissed',
    clientId: CLIENT_ID,
    marketLocationId: LOCATION_ID,
    googlePlaceId: 'place-dismissed',
    state: 'dismissed',
    source: 'agency',
    approvedDomainId: null,
    agencyReviewReason: 'private rejection reason'
  }
]

function event(query: Record<string, unknown> = {}) {
  return { query } as Parameters<typeof nearbyMarketHandler>[0]
}

beforeEach(() => {
  runtimeConfig.nearbyMarketDiscoveryEnabled = true
  runtimeConfig.googlePlacesServerApiKey = 'server-places-key'
  vi.clearAllMocks()
  mocks.requireClientAuth.mockResolvedValue(portalUser)
  mocks.getPrimaryLocation.mockResolvedValue(marketLocation)
  mocks.listCandidates.mockResolvedValue(persistedCandidates)
  mocks.enforceRateLimit.mockResolvedValue(undefined)
  mocks.resolvePlaceLocation.mockResolvedValue({
    placeId: 'place-main',
    location: { latitude: -37.8136, longitude: 144.9631 }
  })
  mocks.searchNearbyDealers.mockResolvedValue(providerCandidates)
})

describe('client portal nearby market discovery', () => {
  it('rejects unauthenticated discovery before tenant or provider work', async () => {
    mocks.requireClientAuth.mockRejectedValue(
      Object.assign(new Error('Not authenticated'), { statusCode: 401 })
    )

    await expect(nearbyMarketHandler(event({ radiusKm: '25' })))
      .rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled()
    expect(mocks.resolvePlaceLocation).not.toHaveBeenCalled()
  })

  it('requires explicit analytics access without inferring another portal permission', async () => {
    mocks.requireClientAuth.mockResolvedValue({
      ...portalUser,
      permissions: { canViewAnalytics: false, canNominateCompetitors: true }
    })

    await expect(nearbyMarketHandler(event({ radiusKm: '25' })))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled()
    expect(mocks.resolvePlaceLocation).not.toHaveBeenCalled()
  })

  it.each([
    { radiusKm: '25', clientId: 'attacker-client' },
    { radiusKm: '25', websiteUri: 'https://attacker.example' },
    { radiusKm: '25', actorId: 'attacker-user' },
    { radiusKm: '25', crawlPurpose: 'ai-input' },
    { radiusKm: '25', unknown: 'value' }
  ])('strictly rejects tenant, website, actor, crawl, and unknown query fields: %j', async (query) => {
    await expect(nearbyMarketHandler(event(query))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid nearby market request'
    })
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled()
    expect(mocks.resolvePlaceLocation).not.toHaveBeenCalled()
  })

  it('returns a safe confirmation state when the authenticated client has no current location', async () => {
    mocks.getPrimaryLocation.mockResolvedValue(null)

    const result = await nearbyMarketHandler(event({ radiusKm: '25' }))

    expect(result).toEqual({
      marketLocation: null,
      radiusKm: 25,
      candidates: [],
      limited: false,
      notice: 'Google returns up to 20 discovery candidates. Results are not exhaustive.'
    })
    expect(mocks.getPrimaryLocation).toHaveBeenCalledWith(CLIENT_ID)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.resolvePlaceLocation).not.toHaveBeenCalled()
  })

  it('enforces exact fail-closed portal user, client, and organization limits before billed calls', async () => {
    await nearbyMarketHandler(event({ radiusKm: '25' }))

    expect(mocks.enforceRateLimit.mock.calls.map(call => call[1])).toEqual([
      { key: `nearby-market:portal:user:${PORTAL_USER_ID}`, limit: 10, windowSeconds: 600, failureMode: 'closed' },
      { key: `nearby-market:portal:client:${CLIENT_ID}`, limit: 30, windowSeconds: 600, failureMode: 'closed' },
      { key: 'nearby-market:org:daily', limit: 500, windowSeconds: 86400, failureMode: 'closed' }
    ])
    expect(mocks.enforceRateLimit.mock.invocationCallOrder.at(-1)!)
      .toBeLessThan(mocks.resolvePlaceLocation.mock.invocationCallOrder[0]!)
    expect(mocks.resolvePlaceLocation.mock.invocationCallOrder[0]!)
      .toBeLessThan(mocks.searchNearbyDealers.mock.invocationCallOrder[0]!)
  })

  it('returns only approved transient map fields and exact plain-language states', async () => {
    const result = await nearbyMarketHandler(event({ radiusKm: '25' }))

    expect(mocks.resolvePlaceLocation).toHaveBeenCalledWith('place-main')
    expect(mocks.listCandidates).toHaveBeenCalledWith(CLIENT_ID, LOCATION_ID, [
      'place-toyota', 'place-local', 'place-used', 'place-saved', 'place-dismissed'
    ])
    expect(result.marketLocation).toEqual({
      id: LOCATION_ID,
      label: 'Main showroom',
      addressText: '100 Collins Street, Melbourne VIC',
      location: { latitude: -37.8136, longitude: 144.9631 }
    })
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0]).toEqual({
      placeId: 'place-toyota',
      displayName: 'City Toyota',
      formattedAddress: '1 Toyota Road',
      location: { latitude: -37.804, longitude: 144.9631 },
      distanceKm: expect.any(Number),
      category: 'franchise_new',
      portalState: 'monitored',
      googleMapsUri: 'https://maps.google.test/toyota'
    })
    expect(result.candidates[1]).toEqual({
      placeId: 'place-local',
      displayName: 'Local Motors',
      formattedAddress: '2 Local Road',
      location: { latitude: -37.794, longitude: 144.9631 },
      distanceKm: expect.any(Number),
      category: 'unclassified',
      portalState: 'under_review',
      googleMapsUri: 'https://maps.google.test/local'
    })
    const serialised = JSON.stringify(result)
    expect(serialised).not.toMatch(/clientId|googlePlaceId|source|approvedDomainId|websiteUri/i)
    expect(serialised).not.toContain('internal agency reason')
    expect(serialised).not.toContain('private rejection reason')
    expect(serialised).not.toContain('private nomination reason')
  })

  it('filters on portal labels, treating both saved and undecided candidates as suggested', async () => {
    const suggested = await nearbyMarketHandler(event({
      radiusKm: '25',
      includeUsedIndependent: 'true',
      monitoringStatus: 'suggested'
    }))
    expect(suggested.candidates.map(candidate => ({
      placeId: candidate.placeId,
      portalState: candidate.portalState
    }))).toEqual([
      { placeId: 'place-used', portalState: 'suggested' },
      { placeId: 'place-saved', portalState: 'suggested' }
    ])

    const dismissed = await nearbyMarketHandler(event({
      radiusKm: '25',
      monitoringStatus: 'not_selected'
    }))
    expect(dismissed.candidates).toEqual([
      expect.objectContaining({ placeId: 'place-dismissed', portalState: 'not_selected' })
    ])
  })

  it('redacts provider failures consistently and never crosses into website or indexing systems', async () => {
    const { GooglePlacesError } = await import('~~/server/utils/siteIntelligence/googlePlaces')
    mocks.resolvePlaceLocation.mockRejectedValue(new GooglePlacesError('quota'))

    await expect(nearbyMarketHandler(event({ radiusKm: '25' }))).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Nearby market provider quota is exhausted'
    })
    expect(mocks.reviewCandidateWebsite).not.toHaveBeenCalled()
    expect(mocks.assertPublicSiteOrigin).not.toHaveBeenCalled()
    expect(mocks.createDomain).not.toHaveBeenCalled()
    expect(mocks.startCrawl).not.toHaveBeenCalled()
    expect(mocks.storeObject).not.toHaveBeenCalled()
    expect(mocks.indexVectors).not.toHaveBeenCalled()
    expect(mocks.sendQueue).not.toHaveBeenCalled()
    expect(mocks.runAi).not.toHaveBeenCalled()
  })
})
