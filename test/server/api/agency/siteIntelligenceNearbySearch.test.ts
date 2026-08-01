import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = {
  nearbyMarketDiscoveryEnabled: true,
  googlePlacesServerApiKey: 'server-places-key'
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  readBody: (event: unknown) => Promise<unknown>
  useRuntimeConfig: () => typeof runtimeConfig
  createError: (options: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.readBody = async event => (event as { body?: unknown }).body
testGlobal.useRuntimeConfig = () => runtimeConfig
testGlobal.createError = options => Object.assign(new Error(options.statusMessage), options)

const mocks = vi.hoisted(() => ({
  requireClientAccess: vi.fn(),
  getPrimaryLocation: vi.fn(),
  listCandidates: vi.fn(),
  upsertPrimaryLocation: vi.fn(),
  upsertCandidate: vi.fn(),
  enforceRateLimit: vi.fn(),
  resolvePlaceLocation: vi.fn(),
  searchNearbyDealers: vi.fn(),
  reviewCandidateWebsite: vi.fn()
}))

vi.mock('~~/server/utils/tracking/analytics-access', () => ({
  requireClientTrackingAccess: (...args: unknown[]) => mocks.requireClientAccess(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/nearbyMarketRepository', () => ({
  getPrimaryClientMarketLocation: (...args: unknown[]) => mocks.getPrimaryLocation(...args),
  listNearbyMarketCandidates: (...args: unknown[]) => mocks.listCandidates(...args),
  upsertPrimaryClientMarketLocation: (...args: unknown[]) => mocks.upsertPrimaryLocation(...args),
  upsertNearbyMarketCandidate: (...args: unknown[]) => mocks.upsertCandidate(...args)
}))

vi.mock('~~/server/utils/rateLimit', () => ({
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/googlePlaces', () => ({
  GooglePlacesError: class GooglePlacesError extends Error {
    constructor(public readonly code: string) {
      super(`raw provider detail: ${code}`)
    }
  },
  googlePlacesClientFromRuntimeConfig: () => ({
    resolvePlaceLocation: mocks.resolvePlaceLocation,
    searchNearbyDealers: mocks.searchNearbyDealers,
    reviewCandidateWebsite: mocks.reviewCandidateWebsite
  })
}))

const { default: searchHandler } = await import(
  '../../../../../server/api/agency/site-intelligence/nearby-market/search.post'
)

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LOCATION_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const DOMAIN_ID = '44444444-4444-4444-8444-444444444444'

const marketLocation = {
  id: LOCATION_ID,
  clientId: CLIENT_ID,
  label: 'Main showroom',
  addressText: '100 Collins Street, Melbourne VIC',
  googlePlaceId: 'place-main',
  isPrimary: true,
  confirmedAt: '2026-08-01T00:00:00.000Z',
  confirmedBy: USER_ID,
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
    placeId: 'place-used',
    displayName: 'Quality Used Cars',
    formattedAddress: '2 Used Road',
    location: { latitude: -37.794, longitude: 144.9631 },
    businessStatus: 'OPERATIONAL',
    primaryType: 'car_dealer',
    types: ['car_dealer'],
    googleMapsUri: 'https://maps.google.test/used'
  },
  {
    placeId: 'place-local',
    displayName: 'Local Motors',
    formattedAddress: '3 Local Road',
    location: { latitude: -37.784, longitude: 144.9631 },
    businessStatus: 'OPERATIONAL',
    primaryType: 'car_dealer',
    types: ['car_dealer'],
    googleMapsUri: 'https://maps.google.test/local'
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
    approvedDomainId: DOMAIN_ID
  },
  {
    id: 'candidate-local',
    clientId: CLIENT_ID,
    marketLocationId: LOCATION_ID,
    googlePlaceId: 'place-local',
    state: 'nominated',
    source: 'client_portal',
    approvedDomainId: null
  },
  {
    id: 'candidate-dismissed',
    clientId: CLIENT_ID,
    marketLocationId: LOCATION_ID,
    googlePlaceId: 'place-dismissed',
    state: 'dismissed',
    source: 'agency',
    approvedDomainId: null
  }
]

function event(body: unknown) {
  return { body } as Parameters<typeof searchHandler>[0]
}

beforeEach(() => {
  runtimeConfig.nearbyMarketDiscoveryEnabled = true
  runtimeConfig.googlePlacesServerApiKey = 'server-places-key'
  mocks.requireClientAccess.mockReset().mockResolvedValue({ id: USER_ID, role: 'media_buyer' })
  mocks.getPrimaryLocation.mockReset().mockResolvedValue(marketLocation)
  mocks.listCandidates.mockReset().mockResolvedValue(persistedCandidates)
  mocks.upsertPrimaryLocation.mockReset().mockResolvedValue(null)
  mocks.upsertCandidate.mockReset().mockResolvedValue(null)
  mocks.enforceRateLimit.mockReset().mockResolvedValue(undefined)
  mocks.resolvePlaceLocation.mockReset().mockResolvedValue({
    placeId: 'place-main',
    location: { latitude: -37.8136, longitude: 144.9631 }
  })
  mocks.searchNearbyDealers.mockReset().mockResolvedValue(providerCandidates)
  mocks.reviewCandidateWebsite.mockReset().mockResolvedValue(null)
})

describe('agency nearby market search', () => {
  it('rejects unauthenticated search before persistence or provider calls', async () => {
    mocks.requireClientAccess.mockRejectedValue(
      Object.assign(new Error('Authentication required'), { statusCode: 401 })
    )

    await expect(searchHandler(event({ clientId: CLIENT_ID, radiusKm: 25 })))
      .rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled()
    expect(mocks.resolvePlaceLocation).not.toHaveBeenCalled()
  })

  it('rejects inaccessible client scope before persistence or provider calls', async () => {
    mocks.requireClientAccess.mockRejectedValue(
      Object.assign(new Error('No access to this client'), { statusCode: 403 })
    )

    await expect(searchHandler(event({ clientId: CLIENT_ID, radiusKm: 25 })))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled()
    expect(mocks.resolvePlaceLocation).not.toHaveBeenCalled()
  })

  it('fails closed when disabled or missing its private server credential', async () => {
    runtimeConfig.nearbyMarketDiscoveryEnabled = false
    await expect(searchHandler(event({ clientId: CLIENT_ID, radiusKm: 25 })))
      .rejects.toMatchObject({ statusCode: 503 })

    runtimeConfig.nearbyMarketDiscoveryEnabled = true
    runtimeConfig.googlePlacesServerApiKey = ''
    await expect(searchHandler(event({ clientId: CLIENT_ID, radiusKm: 25 })))
      .rejects.toMatchObject({ statusCode: 503 })

    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled()
    expect(mocks.resolvePlaceLocation).not.toHaveBeenCalled()
  })

  it.each([10, 25, 50])('accepts the supported %i km radius', async (radiusKm) => {
    mocks.getPrimaryLocation.mockResolvedValue(null)

    const result = await searchHandler(event({ clientId: CLIENT_ID, radiusKm }))

    expect(result).toMatchObject({
      clientId: CLIENT_ID,
      marketLocation: null,
      radiusKm,
      candidates: [],
      limited: false
    })
  })

  it.each([0, 20, 100])('rejects unsupported radius %i before provider work', async (radiusKm) => {
    await expect(searchHandler(event({ clientId: CLIENT_ID, radiusKm }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid nearby market search'
    })
    expect(mocks.requireClientAccess).not.toHaveBeenCalled()
    expect(mocks.resolvePlaceLocation).not.toHaveBeenCalled()
  })

  it('returns a location-confirmation state without consuming limits or calling Google', async () => {
    mocks.getPrimaryLocation.mockResolvedValue(null)

    const result = await searchHandler(event({ clientId: CLIENT_ID, radiusKm: 25 }))

    expect(result).toMatchObject({ marketLocation: null, candidates: [], limited: false })
    expect(JSON.stringify(result)).toMatch(/up to 20 discovery candidates/i)
    expect(JSON.stringify(result)).toMatch(/not exhaustive/i)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.resolvePlaceLocation).not.toHaveBeenCalled()
  })

  it('enforces every exact fail-closed limit before either billed provider call', async () => {
    await searchHandler(event({ clientId: CLIENT_ID, radiusKm: 25 }))

    expect(mocks.enforceRateLimit.mock.calls.map(call => call[1])).toEqual([
      { key: `nearby-market:agency:user:${USER_ID}`, limit: 30, windowSeconds: 600, failureMode: 'closed' },
      { key: `nearby-market:agency:client:${CLIENT_ID}`, limit: 60, windowSeconds: 600, failureMode: 'closed' },
      { key: 'nearby-market:org:daily', limit: 500, windowSeconds: 86400, failureMode: 'closed' }
    ])
    const finalLimitOrder = mocks.enforceRateLimit.mock.invocationCallOrder.at(-1)!
    expect(finalLimitOrder).toBeLessThan(mocks.resolvePlaceLocation.mock.invocationCallOrder[0]!)
    expect(mocks.resolvePlaceLocation.mock.invocationCallOrder[0]!)
      .toBeLessThan(mocks.searchNearbyDealers.mock.invocationCallOrder[0]!)
  })

  it('resolves the stored Place ID, merges decisions, and hides used and dismissed results by default', async () => {
    const result = await searchHandler(event({ clientId: CLIENT_ID, radiusKm: 25 }))

    expect(mocks.resolvePlaceLocation).toHaveBeenCalledWith('place-main')
    expect(mocks.searchNearbyDealers).toHaveBeenCalledWith({
      latitude: -37.8136,
      longitude: 144.9631,
      radiusKm: 25
    })
    expect(mocks.listCandidates).toHaveBeenCalledWith(CLIENT_ID, LOCATION_ID, [
      'place-toyota', 'place-used', 'place-local', 'place-dismissed'
    ])
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates[0]).toMatchObject({
      placeId: 'place-toyota',
      category: 'franchise_new',
      state: 'approved',
      source: 'agency',
      approvedDomainId: DOMAIN_ID,
      portalState: 'monitored'
    })
    expect(result.candidates[1]).toMatchObject({
      placeId: 'place-local',
      category: 'unclassified',
      state: 'nominated',
      source: 'client_portal',
      portalState: 'under_review'
    })
    expect(result.candidates[0]?.distanceKm).toBeGreaterThan(0)
    expect(mocks.reviewCandidateWebsite).not.toHaveBeenCalled()
    expect(mocks.upsertPrimaryLocation).not.toHaveBeenCalled()
    expect(mocks.upsertCandidate).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('googleMapsUri')
    expect(JSON.stringify(result)).not.toContain('businessStatus')
  })

  it('applies brand, used-category, and monitoring-status filters after merging', async () => {
    const usedResult = await searchHandler(event({
      clientId: CLIENT_ID,
      radiusKm: 25,
      includeUsedIndependent: true,
      brand: 'quality',
      monitoringStatus: 'saved'
    }))
    expect(usedResult.candidates).toEqual([])

    const dismissedResult = await searchHandler(event({
      clientId: CLIENT_ID,
      radiusKm: 25,
      includeUsedIndependent: true,
      brand: 'mazda',
      monitoringStatus: 'dismissed'
    }))
    expect(dismissedResult.candidates.map(candidate => candidate.placeId))
      .toEqual(['place-dismissed'])
  })

  it('marks exactly twenty returned candidates as capped and explicitly non-exhaustive', async () => {
    mocks.searchNearbyDealers.mockResolvedValue(Array.from({ length: 20 }, (_, index) => ({
      ...providerCandidates[2],
      placeId: `place-${index}`,
      displayName: `Local Motors ${index}`
    })))
    mocks.listCandidates.mockResolvedValue([])

    const result = await searchHandler(event({ clientId: CLIENT_ID, radiusKm: 50 }))

    expect(result.candidates).toHaveLength(20)
    expect(result.limited).toBe(true)
    expect(JSON.stringify(result)).toMatch(/up to 20 discovery candidates/i)
    expect(JSON.stringify(result)).toMatch(/not exhaustive/i)
  })

  it('maps provider categories to redacted operational errors', async () => {
    const { GooglePlacesError } = await import('~~/server/utils/siteIntelligence/googlePlaces')
    mocks.resolvePlaceLocation.mockRejectedValue(new GooglePlacesError('quota'))

    await expect(searchHandler(event({ clientId: CLIENT_ID, radiusKm: 25 })))
      .rejects.toMatchObject({
        statusCode: 503,
        statusMessage: 'Nearby market provider quota is exhausted'
      })
  })
})
