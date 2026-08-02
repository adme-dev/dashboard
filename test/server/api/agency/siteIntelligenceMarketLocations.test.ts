import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = {
  nearbyMarketDiscoveryEnabled: true,
  googlePlacesServerApiKey: 'server-places-key'
}

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
  transaction: vi.fn(),
  requireRole: vi.fn(),
  requireClientAccess: vi.fn(),
  getPrimaryLocation: vi.fn(),
  upsertPrimaryLocation: vi.fn(),
  writeAudit: vi.fn(),
  previewAddress: vi.fn(),
  resolvePlaceLocation: vi.fn(),
  searchNearbyDealers: vi.fn(),
  reviewCandidateWebsite: vi.fn()
}))

const transactionExecutor = { query: vi.fn() }

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: unknown[]) => mocks.transaction(...args)
}))

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mocks.requireRole(...args)
}))

vi.mock('~~/server/utils/tracking/analytics-access', () => ({
  requireClientTrackingAccess: (...args: unknown[]) => mocks.requireClientAccess(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/nearbyMarketRepository', () => ({
  getPrimaryClientMarketLocation: (...args: unknown[]) => mocks.getPrimaryLocation(...args),
  upsertPrimaryClientMarketLocation: (...args: unknown[]) => mocks.upsertPrimaryLocation(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/audit', () => ({
  writeSiteIntelligenceAudit: (...args: unknown[]) => mocks.writeAudit(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/googlePlaces', () => ({
  GooglePlacesError: class GooglePlacesError extends Error {
    constructor(public readonly code: string) {
      super(`provider detail that must not escape: ${code}`)
    }
  },
  googlePlacesClientFromRuntimeConfig: () => ({
    previewAddress: mocks.previewAddress,
    resolvePlaceLocation: mocks.resolvePlaceLocation,
    searchNearbyDealers: mocks.searchNearbyDealers,
    reviewCandidateWebsite: mocks.reviewCandidateWebsite
  })
}))

const { default: getHandler } = await import(
  '../../../../../server/api/agency/site-intelligence/market-locations/index.get'
)
const { default: putHandler } = await import(
  '../../../../../server/api/agency/site-intelligence/market-locations/[id].put'
)

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LOCATION_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

const confirmedLocation = {
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

function event(input: {
  query?: Record<string, unknown>
  params?: Record<string, string>
  body?: unknown
} = {}) {
  return input as Parameters<typeof putHandler>[0]
}

beforeEach(() => {
  runtimeConfig.nearbyMarketDiscoveryEnabled = true
  runtimeConfig.googlePlacesServerApiKey = 'server-places-key'
  mocks.requireRole.mockReset().mockResolvedValue({ id: USER_ID, role: 'owner' })
  mocks.transaction.mockReset().mockImplementation(async callback => callback(transactionExecutor))
  mocks.requireClientAccess.mockReset().mockResolvedValue({ id: USER_ID, role: 'owner' })
  mocks.getPrimaryLocation.mockReset().mockResolvedValue(confirmedLocation)
  mocks.upsertPrimaryLocation.mockReset().mockResolvedValue(confirmedLocation)
  mocks.writeAudit.mockReset().mockResolvedValue('audit-id')
  mocks.previewAddress.mockReset().mockResolvedValue([])
  mocks.resolvePlaceLocation.mockReset().mockResolvedValue({
    placeId: 'place-main',
    location: { latitude: -37.8136, longitude: 144.9631 }
  })
  mocks.searchNearbyDealers.mockReset().mockResolvedValue([])
  mocks.reviewCandidateWebsite.mockReset().mockResolvedValue(null)
})

describe('agency market location routes', () => {
  it('rejects an unauthenticated location read before querying persistence', async () => {
    mocks.requireClientAccess.mockRejectedValue(
      Object.assign(new Error('Authentication required'), { statusCode: 401 })
    )

    await expect(getHandler(event({ query: { clientId: CLIENT_ID } })))
      .rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled()
  })

  it('returns the confirmed primary location only after client-scoped access', async () => {
    await expect(getHandler(event({ query: { clientId: CLIENT_ID } })))
      .resolves.toEqual({ marketLocation: confirmedLocation })
    expect(mocks.requireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID)
    expect(mocks.getPrimaryLocation).toHaveBeenCalledWith(CLIENT_ID)
  })

  it('rejects a non-admin mutation before client access or provider work', async () => {
    mocks.requireRole.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))

    await expect(putHandler(event({
      params: { id: CLIENT_ID },
      body: { action: 'preview', addressText: '100 Collins Street' }
    }))).rejects.toMatchObject({ statusCode: 403 })

    expect(mocks.requireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(mocks.requireClientAccess).not.toHaveBeenCalled()
    expect(mocks.previewAddress).not.toHaveBeenCalled()
  })

  it('rejects a mutation outside the operator client scope before provider work', async () => {
    mocks.requireClientAccess.mockRejectedValue(
      Object.assign(new Error('No access to this client'), { statusCode: 403 })
    )

    await expect(putHandler(event({
      params: { id: CLIENT_ID },
      body: { action: 'preview', addressText: '100 Collins Street' }
    }))).rejects.toMatchObject({ statusCode: 403 })

    expect(mocks.previewAddress).not.toHaveBeenCalled()
  })

  it('fails closed without provider work when discovery is disabled', async () => {
    runtimeConfig.nearbyMarketDiscoveryEnabled = false

    await expect(putHandler(event({
      params: { id: CLIENT_ID },
      body: { action: 'preview', addressText: '100 Collins Street' }
    }))).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: expect.stringMatching(/disabled|unavailable/i)
    })
    expect(mocks.previewAddress).not.toHaveBeenCalled()
  })

  it('fails closed with a redacted operational error when the server key is absent', async () => {
    runtimeConfig.googlePlacesServerApiKey = ''

    await expect(putHandler(event({
      params: { id: CLIENT_ID },
      body: { action: 'preview', addressText: '100 Collins Street' }
    }))).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: expect.stringMatching(/not configured|misconfigured/i)
    })
    expect(mocks.previewAddress).not.toHaveBeenCalled()
  })

  it('returns at most five transient address choices without any write or audit', async () => {
    const choices = Array.from({ length: 6 }, (_, index) => ({
      placeId: `place-${index}`,
      displayName: `Dealer ${index}`,
      formattedAddress: `${index} Example Street`,
      location: { latitude: -37.8 + index / 100, longitude: 144.9 }
    }))
    mocks.previewAddress.mockResolvedValue(choices)

    const result = await putHandler(event({
      params: { id: CLIENT_ID },
      body: { action: 'preview', addressText: '100 Collins Street' }
    }))

    expect(result).toEqual({ choices: choices.slice(0, 5) })
    expect(mocks.previewAddress).toHaveBeenCalledWith('100 Collins Street')
    expect(mocks.upsertPrimaryLocation).not.toHaveBeenCalled()
    expect(mocks.writeAudit).not.toHaveBeenCalled()
  })

  it('re-fetches current Place location and persists only reviewer-confirmed location fields', async () => {
    const result = await putHandler(event({
      params: { id: CLIENT_ID },
      body: {
        action: 'confirm',
        placeId: 'place-main',
        label: 'Main showroom',
        addressText: '100 Collins Street, Melbourne VIC'
      }
    }))

    expect(result).toEqual({ marketLocation: confirmedLocation })
    expect(mocks.resolvePlaceLocation).toHaveBeenCalledWith('place-main')
    expect(mocks.upsertPrimaryLocation).toHaveBeenCalledWith(
      CLIENT_ID,
      {
        label: 'Main showroom',
        addressText: '100 Collins Street, Melbourne VIC',
        googlePlaceId: 'place-main',
        confirmedBy: USER_ID
      },
      transactionExecutor
    )
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      { id: USER_ID, role: 'owner' },
      CLIENT_ID,
      'market_location.confirmed',
      'market_location',
      LOCATION_ID,
      { googlePlaceId: 'place-main', label: 'Main showroom' },
      transactionExecutor
    )
    expect(JSON.stringify(mocks.upsertPrimaryLocation.mock.calls)).not.toContain('latitude')
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain('addressText')
  })

  it('redacts provider failures instead of exposing provider detail', async () => {
    const { GooglePlacesError } = await import('~~/server/utils/siteIntelligence/googlePlaces')
    mocks.previewAddress.mockRejectedValue(new GooglePlacesError('auth'))

    await expect(putHandler(event({
      params: { id: CLIENT_ID },
      body: { action: 'preview', addressText: '100 Collins Street' }
    }))).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Nearby market provider is misconfigured'
    })
  })
})
