import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeConfig = {
  nearbyMarketDiscoveryEnabled: true,
  googlePlacesServerApiKey: 'server-places-key'
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: unknown) => Record<string, unknown>
  getRouterParam: (event: unknown, key: string) => string | undefined
  useRuntimeConfig: () => typeof runtimeConfig
  createError: (options: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getQuery = event => (event as { query?: Record<string, unknown> }).query ?? {}
testGlobal.getRouterParam = (event, key) => (event as { params?: Record<string, string> }).params?.[key]
testGlobal.useRuntimeConfig = () => runtimeConfig
testGlobal.createError = options => Object.assign(new Error(options.statusMessage), options)

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireClientAccess: vi.fn(),
  getPrimaryLocation: vi.fn(),
  enforceRateLimit: vi.fn(),
  reviewCandidateWebsite: vi.fn(),
  assertPublicOrigin: vi.fn(),
  findDomain: vi.fn()
}))

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mocks.requireRole(...args)
}))

vi.mock('~~/server/utils/tracking/analytics-access', () => ({
  isUuid: (value: string | undefined) => /^[0-9a-f-]{36}$/i.test(value ?? ''),
  requireClientTrackingAccess: (...args: unknown[]) => mocks.requireClientAccess(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/nearbyMarketRepository', () => ({
  getPrimaryClientMarketLocation: (...args: unknown[]) => mocks.getPrimaryLocation(...args)
}))

vi.mock('~~/server/utils/rateLimit', () => ({
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/googlePlaces', () => ({
  GooglePlacesError: class GooglePlacesError extends Error {
    constructor(public readonly code: string) {
      super(`sensitive provider detail: ${code}`)
    }
  },
  googlePlacesClientFromRuntimeConfig: () => ({
    reviewCandidateWebsite: mocks.reviewCandidateWebsite
  })
}))

vi.mock('~~/server/utils/siteIntelligence/urlPolicy', () => ({
  assertPublicSiteOrigin: (...args: unknown[]) => mocks.assertPublicOrigin(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/repository', () => ({
  findSiteIntelligenceDomainByOrigin: (...args: unknown[]) => mocks.findDomain(...args)
}))

const { default: reviewHandler } = await import(
  '../../../../../server/api/agency/site-intelligence/nearby-market/candidates/[placeId].get'
)

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LOCATION_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const DOMAIN_ID = '44444444-4444-4444-8444-444444444444'

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

const providerReview = {
  placeId: 'candidate-place',
  displayName: 'Transient Google Dealer Name',
  formattedAddress: '1 Provider Street',
  googleMapsUri: 'https://maps.google.test/candidate-place',
  websiteUri: 'https://Dealer.Example.com/offers',
  businessStatus: 'OPERATIONAL'
}

function event(input: {
  query?: Record<string, unknown>
  params?: Record<string, string>
} = {}) {
  return input as Parameters<typeof reviewHandler>[0]
}

beforeEach(() => {
  runtimeConfig.nearbyMarketDiscoveryEnabled = true
  runtimeConfig.googlePlacesServerApiKey = 'server-places-key'
  mocks.requireRole.mockReset().mockResolvedValue({ id: USER_ID, role: 'owner' })
  mocks.requireClientAccess.mockReset().mockResolvedValue({ id: USER_ID, role: 'owner' })
  mocks.getPrimaryLocation.mockReset().mockResolvedValue(confirmedLocation)
  mocks.enforceRateLimit.mockReset().mockResolvedValue(undefined)
  mocks.reviewCandidateWebsite.mockReset().mockResolvedValue(providerReview)
  mocks.assertPublicOrigin.mockReset().mockResolvedValue('https://dealer.example.com')
  mocks.findDomain.mockReset().mockResolvedValue(null)
})

describe('agency candidate website review', () => {
  it('requires owner/admin authentication before client, provider, or URL-policy work', async () => {
    mocks.requireRole.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))

    await expect(reviewHandler(event({
      params: { placeId: 'candidate-place' },
      query: { clientId: CLIENT_ID, marketLocationId: LOCATION_ID }
    }))).rejects.toMatchObject({ statusCode: 403 })

    expect(mocks.requireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(mocks.requireClientAccess).not.toHaveBeenCalled()
    expect(mocks.reviewCandidateWebsite).not.toHaveBeenCalled()
    expect(mocks.assertPublicOrigin).not.toHaveBeenCalled()
  })

  it('rejects inaccessible clients and portal-shaped callers before Google lookup', async () => {
    mocks.requireClientAccess.mockRejectedValue(
      Object.assign(new Error('No access to this client'), { statusCode: 403 })
    )

    await expect(reviewHandler(event({
      params: { placeId: 'candidate-place' },
      query: { clientId: CLIENT_ID, marketLocationId: LOCATION_ID }
    }))).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.reviewCandidateWebsite).not.toHaveBeenCalled()

    mocks.requireRole.mockRejectedValue(
      Object.assign(new Error('Agency authentication required'), { statusCode: 401 })
    )
    await expect(reviewHandler(event({
      params: { placeId: 'candidate-place' },
      query: { clientId: CLIENT_ID, marketLocationId: LOCATION_ID, clientUserId: 'portal-user' }
    }))).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.reviewCandidateWebsite).not.toHaveBeenCalled()
  })

  it('requires the current confirmed location for the same client', async () => {
    await expect(reviewHandler(event({
      params: { placeId: 'candidate-place' },
      query: {
        clientId: CLIENT_ID,
        marketLocationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      }
    }))).rejects.toMatchObject({ statusCode: 409 })

    mocks.getPrimaryLocation.mockResolvedValue(null)
    await expect(reviewHandler(event({
      params: { placeId: 'candidate-place' },
      query: { clientId: CLIENT_ID, marketLocationId: LOCATION_ID }
    }))).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.reviewCandidateWebsite).not.toHaveBeenCalled()
  })

  it('enforces the exact fail-closed review ceilings before its on-demand website lookup', async () => {
    await reviewHandler(event({
      params: { placeId: 'candidate-place' },
      query: { clientId: CLIENT_ID, marketLocationId: LOCATION_ID }
    }))

    expect(mocks.enforceRateLimit.mock.calls.map(call => call[1])).toEqual([
      {
        key: `nearby-market:agency:review:user:${USER_ID}`,
        limit: 20,
        windowSeconds: 3600,
        failureMode: 'closed'
      },
      {
        key: 'nearby-market:org:daily',
        limit: 500,
        windowSeconds: 86400,
        failureMode: 'closed'
      }
    ])
    expect(mocks.enforceRateLimit.mock.invocationCallOrder.at(-1)!)
      .toBeLessThan(mocks.reviewCandidateWebsite.mock.invocationCallOrder[0]!)
  })

  it('returns only the transient website, canonical duplicate status, and approval eligibility', async () => {
    mocks.findDomain.mockResolvedValue({ id: DOMAIN_ID })

    const result = await reviewHandler(event({
      params: { placeId: 'candidate-place' },
      query: { clientId: CLIENT_ID, marketLocationId: LOCATION_ID }
    }))

    expect(mocks.reviewCandidateWebsite).toHaveBeenCalledWith('candidate-place')
    expect(mocks.assertPublicOrigin).toHaveBeenCalledWith('https://Dealer.Example.com/offers')
    expect(mocks.findDomain).toHaveBeenCalledWith(
      CLIENT_ID,
      'https://dealer.example.com',
      'competitor'
    )
    expect(result).toEqual({
      placeId: 'candidate-place',
      websiteUri: 'https://Dealer.Example.com/offers',
      canonicalOrigin: 'https://dealer.example.com',
      existingDomainId: DOMAIN_ID,
      canApprove: true
    })
    expect(JSON.stringify(result)).not.toMatch(
      /Transient Google Dealer Name|Provider Street|googleMapsUri|businessStatus|server-places-key|sensitive provider detail/i
    )
  })

  it('rejects a provider Place-ID mismatch without leaking the provider body', async () => {
    mocks.reviewCandidateWebsite.mockResolvedValue({ ...providerReview, placeId: 'other-place' })

    await expect(reviewHandler(event({
      params: { placeId: 'candidate-place' },
      query: { clientId: CLIENT_ID, marketLocationId: LOCATION_ID }
    }))).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: expect.not.stringMatching(/other-place|sensitive provider detail|credential|key/i)
    })
    expect(mocks.assertPublicOrigin).not.toHaveBeenCalled()
  })

  it('keeps missing and URL-policy-rejected provider websites reviewable but not approvable', async () => {
    mocks.reviewCandidateWebsite.mockResolvedValue({ ...providerReview, websiteUri: null })

    await expect(reviewHandler(event({
      params: { placeId: 'candidate-place' },
      query: { clientId: CLIENT_ID, marketLocationId: LOCATION_ID }
    }))).resolves.toEqual({
      placeId: 'candidate-place',
      websiteUri: null,
      canonicalOrigin: null,
      existingDomainId: null,
      canApprove: false
    })

    mocks.reviewCandidateWebsite.mockResolvedValue({
      ...providerReview,
      websiteUri: 'http://127.0.0.1/private'
    })
    mocks.assertPublicOrigin.mockRejectedValue(new Error('blocked private address 127.0.0.1'))

    const invalid = await reviewHandler(event({
      params: { placeId: 'candidate-place' },
      query: { clientId: CLIENT_ID, marketLocationId: LOCATION_ID }
    }))
    expect(invalid).toEqual({
      placeId: 'candidate-place',
      websiteUri: null,
      canonicalOrigin: null,
      existingDomainId: null,
      canApprove: false
    })
    expect(JSON.stringify(invalid)).not.toMatch(/127\.0\.0\.1|blocked private address/i)
    expect(mocks.findDomain).not.toHaveBeenCalled()
  })
})
