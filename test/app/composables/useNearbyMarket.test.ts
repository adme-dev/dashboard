import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NearbyMarketResponse } from '~~/app/types/site-intelligence'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LOCATION_ID = '22222222-2222-4222-8222-222222222222'

const location = {
  id: LOCATION_ID,
  clientId: CLIENT_ID,
  label: 'Primary showroom',
  addressText: '1 Motor Way, Melbourne VIC',
  googlePlaceId: 'client-place',
  isPrimary: true,
  confirmedAt: '2026-08-01T00:00:00.000Z',
  confirmedBy: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z'
}

function market(radiusKm: 10 | 25 | 50, placeId = `place-${radiusKm}`): NearbyMarketResponse {
  return {
    clientId: CLIENT_ID,
    marketLocation: location,
    radiusKm,
    candidates: [{
      placeId,
      displayName: `Dealer ${radiusKm}`,
      formattedAddress: '2 Dealer Road, Melbourne VIC',
      location: { latitude: -37.81, longitude: 144.96 },
      distanceKm: 3.2,
      category: 'franchise_new',
      state: null,
      source: null,
      approvedDomainId: null,
      portalState: null
    }],
    limited: false
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('useNearbyMarket', () => {
  it('owns the radius, used-independent filter, and marker/list selection defaults', async () => {
    vi.stubGlobal('$fetch', vi.fn())
    const { useNearbyMarket } = await import('~~/app/composables/useNearbyMarket')
    const nearby = useNearbyMarket()

    expect(nearby.filters.value).toMatchObject({
      radiusKm: 25,
      includeUsedIndependent: false,
      brand: 'all',
      monitoringStatus: 'all'
    })
    expect(nearby.selectedPlaceId.value).toBeNull()

    nearby.updateFilters({ radiusKm: 50, includeUsedIndependent: true, brand: 'Toyota' })
    nearby.selectCandidate('toyota-place')

    expect(nearby.filters.value).toMatchObject({
      radiusKm: 50,
      includeUsedIndependent: true,
      brand: 'Toyota'
    })
    expect(nearby.selectedPlaceId.value).toBe('toyota-place')
  })

  it('aborts stale searches and prevents an older response overwriting newer radius results', async () => {
    const oldRequest = deferred<NearbyMarketResponse>()
    const currentRequest = deferred<NearbyMarketResponse>()
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn((_request: string, options: { signal: AbortSignal }) => {
      signals.push(options.signal)
      return signals.length === 1 ? oldRequest.promise : currentRequest.promise
    })
    vi.stubGlobal('$fetch', fetchMock)
    const { useNearbyMarket } = await import('~~/app/composables/useNearbyMarket')
    const nearby = useNearbyMarket()

    const stale = nearby.search(CLIENT_ID)
    nearby.updateFilters({ radiusKm: 50 })
    const current = nearby.search(CLIENT_ID)

    expect(signals[0]?.aborted).toBe(true)
    currentRequest.resolve(market(50))
    await current
    oldRequest.resolve(market(25))
    await stale

    expect(nearby.market.value?.radiusKm).toBe(50)
    expect(nearby.candidates.value[0]?.placeId).toBe('place-50')
    expect(nearby.status.search).toBe('success')
  })

  it('does not let a stale candidate review reset selection after the user moves on', async () => {
    const reviewRequest = deferred<{
      placeId: string
      displayName: string
      websiteUri: string
      canonicalOrigin: string
      existingDomainId: null
      canApprove: boolean
    }>()
    let reviewSignal: AbortSignal | undefined
    vi.stubGlobal('$fetch', vi.fn((request: string, options: { signal?: AbortSignal }) => {
      if (request.includes('market-locations')) return Promise.resolve({ marketLocation: location })
      reviewSignal = options.signal
      return reviewRequest.promise
    }))
    const { useNearbyMarket } = await import('~~/app/composables/useNearbyMarket')
    const nearby = useNearbyMarket()
    await nearby.loadLocation(CLIENT_ID)

    const staleReview = nearby.reviewCandidate('place-a')
    nearby.selectCandidate('place-b')
    reviewRequest.resolve({
      placeId: 'place-a',
      displayName: 'Dealer A',
      websiteUri: 'https://dealer-a.example',
      canonicalOrigin: 'https://dealer-a.example',
      existingDomainId: null,
      canApprove: true
    })
    await staleReview

    expect(reviewSignal?.aborted).toBe(true)
    expect(nearby.selectedPlaceId.value).toBe('place-b')
    expect(nearby.candidateReview.value).toBeNull()
  })

  it('does not let an older search overwrite a newer location refresh', async () => {
    const searchRequest = deferred<NearbyMarketResponse>()
    const newLocation = { ...location, id: '33333333-3333-4333-8333-333333333333', addressText: '9 New Motor Way' }
    let searchSignal: AbortSignal | undefined
    vi.stubGlobal('$fetch', vi.fn((request: string, options: { signal?: AbortSignal }) => {
      if (request.endsWith('/search')) {
        searchSignal = options.signal
        return searchRequest.promise
      }
      return Promise.resolve({ marketLocation: newLocation })
    }))
    const { useNearbyMarket } = await import('~~/app/composables/useNearbyMarket')
    const nearby = useNearbyMarket()

    const staleSearch = nearby.search(CLIENT_ID)
    await nearby.loadLocation(CLIENT_ID)
    searchRequest.resolve(market(25))
    await staleSearch

    expect(searchSignal?.aborted).toBe(true)
    expect(nearby.location.value?.id).toBe('33333333-3333-4333-8333-333333333333')
    expect(nearby.location.value?.addressText).toBe('9 New Motor Way')
  })

  it('retries location, search, candidate review, decision, and nominations independently', async () => {
    const attempts = new Map<string, number>()
    const fetchMock = vi.fn(async (request: string, options: { method?: string, body?: unknown }) => {
      const resource = request.includes('market-locations')
        ? 'location'
        : request.endsWith('/search')
          ? 'search'
          : request.endsWith('/nominations')
            ? 'nominations'
            : options?.method === 'POST'
              ? 'decision'
              : 'candidateReview'
      const attempt = (attempts.get(resource) ?? 0) + 1
      attempts.set(resource, attempt)
      if (attempt === 1) throw new Error(`${resource} unavailable`)
      if (resource === 'location') return { marketLocation: location }
      if (resource === 'search') return market(25)
      if (resource === 'candidateReview') {
        return {
          placeId: 'candidate-place',
          displayName: 'Candidate Motors',
          websiteUri: 'https://candidate.example',
          canonicalOrigin: 'https://candidate.example',
          existingDomainId: null,
          canApprove: true
        }
      }
      if (resource === 'nominations') return { nominations: [{ id: 'nomination-1' }] }
      return { candidate: { id: 'decision-1', state: 'saved' }, domain: null, run: null, crawlStart: null }
    })
    vi.stubGlobal('$fetch', fetchMock)
    const { useNearbyMarket } = await import('~~/app/composables/useNearbyMarket')
    const nearby = useNearbyMarket()

    await nearby.loadLocation(CLIENT_ID)
    await nearby.retryLocation()
    await nearby.search(CLIENT_ID)
    await nearby.retrySearch()
    await nearby.reviewCandidate('candidate-place')
    await nearby.retryCandidateReview()
    await nearby.decideCandidate('candidate-place', { action: 'save' })
    await nearby.retryDecision()
    await nearby.loadNominations(CLIENT_ID)
    await nearby.retryNominations()

    expect(Object.fromEntries(attempts)).toEqual({
      location: 2,
      search: 2,
      candidateReview: 2,
      decision: 2,
      nominations: 2
    })
    expect(nearby.status).toMatchObject({
      location: 'success',
      search: 'success',
      candidateReview: 'success',
      decision: 'success',
      nominations: 'success'
    })
    expect(nearby.errors).toMatchObject({
      location: null,
      search: null,
      candidateReview: null,
      decision: null,
      nominations: null
    })
  })
})
