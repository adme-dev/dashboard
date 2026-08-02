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
  getCandidate: vi.fn(),
  getPrimaryLocation: vi.fn(),
  materializeAndLockCandidate: vi.fn(),
  updateCandidateDecision: vi.fn(),
  listNominations: vi.fn(),
  enforceRateLimit: vi.fn(),
  reviewCandidateWebsite: vi.fn(),
  assertPublicOrigin: vi.fn(),
  findDomain: vi.fn(),
  lockDomainOrigin: vi.fn(),
  getDomainForClient: vi.fn(),
  createDomain: vi.fn(),
  getDomainRunState: vi.fn(),
  writeAudit: vi.fn(),
  startCrawl: vi.fn()
}))

const transactionExecutor = { query: vi.fn() }

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  transaction: (...args: unknown[]) => mocks.transaction(...args)
}))

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mocks.requireRole(...args)
}))

vi.mock('~~/server/utils/tracking/analytics-access', () => ({
  isUuid: (value: string | undefined) => /^[0-9a-f-]{36}$/i.test(value ?? ''),
  requireClientTrackingAccess: (...args: unknown[]) => mocks.requireClientAccess(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/nearbyMarketRepository', () => ({
  getNearbyMarketCandidate: (...args: unknown[]) => mocks.getCandidate(...args),
  getPrimaryClientMarketLocation: (...args: unknown[]) => mocks.getPrimaryLocation(...args),
  materializeAndLockNearbyMarketCandidate: (...args: unknown[]) => mocks.materializeAndLockCandidate(...args),
  updateNearbyMarketCandidateDecision: (...args: unknown[]) => mocks.updateCandidateDecision(...args),
  listNearbyMarketNominations: (...args: unknown[]) => mocks.listNominations(...args)
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
    reviewCandidateWebsite: mocks.reviewCandidateWebsite
  })
}))

vi.mock('~~/server/utils/siteIntelligence/urlPolicy', () => ({
  assertPublicSiteOrigin: (...args: unknown[]) => mocks.assertPublicOrigin(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/repository', () => ({
  findSiteIntelligenceDomainByOrigin: (...args: unknown[]) => mocks.findDomain(...args),
  lockSiteIntelligenceDomainOrigin: (...args: unknown[]) => mocks.lockDomainOrigin(...args),
  getSiteIntelligenceDomainForClient: (...args: unknown[]) => mocks.getDomainForClient(...args),
  createSiteIntelligenceDomain: (...args: unknown[]) => mocks.createDomain(...args),
  getSiteIntelligenceDomainRunState: (...args: unknown[]) => mocks.getDomainRunState(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/audit', () => ({
  writeSiteIntelligenceAudit: (...args: unknown[]) => mocks.writeAudit(...args)
}))

vi.mock('~~/server/utils/siteIntelligence/crawlRunner', () => ({
  startGovernedSiteIntelligenceCrawl: (...args: unknown[]) => mocks.startCrawl(...args)
}))

const { default: decisionHandler } = await import(
  '../../../../../server/api/agency/site-intelligence/nearby-market/candidates/[placeId]/decision.post'
)
const { default: nominationsHandler } = await import(
  '../../../../../server/api/agency/site-intelligence/nearby-market/nominations.get'
)
const actualCandidateRepository = await vi.importActual<
  typeof import('~~/server/utils/siteIntelligence/nearbyMarketRepository')
>('~~/server/utils/siteIntelligence/nearbyMarketRepository')
const actualDomainRepository = await vi.importActual<
  typeof import('~~/server/utils/siteIntelligence/repository')
>('~~/server/utils/siteIntelligence/repository')

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LOCATION_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const DOMAIN_ID = '44444444-4444-4444-8444-444444444444'
const RUN_ID = '55555555-5555-4555-8555-555555555555'

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

const savedCandidate = {
  id: 'candidate-id',
  clientId: CLIENT_ID,
  marketLocationId: LOCATION_ID,
  googlePlaceId: 'candidate-place',
  state: 'saved' as const,
  source: 'agency' as const,
  approvedDomainId: null,
  radiusKmAtDecision: 25 as const,
  nominationReason: null,
  nominatedAt: null,
  nominatedByClientUserId: null,
  agencyReviewReason: null,
  reviewedAt: null,
  reviewedByUserId: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z'
}

const domain = {
  id: DOMAIN_ID,
  clientId: CLIENT_ID,
  lane: 'competitor' as const,
  name: 'dealer.example.com',
  origin: 'https://dealer.example.com',
  justification: 'Monitor this nearby competitor.',
  approvedBy: USER_ID,
  approvedAt: '2026-08-02T00:00:00.000Z',
  status: 'active' as const,
  discoveryMode: 'sitemaps' as const,
  includePatterns: [],
  excludePatterns: [],
  includeSubdomains: false,
  renderMode: 'auto' as const,
  pageLimit: 25,
  depth: 1,
  frequency: 'manual' as const,
  crawlPurposes: ['search' as const],
  aiInputAllowed: false,
  retentionDays: 30,
  lastRunAt: null,
  nextRunAt: null,
  latestRunStatus: null,
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z'
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
  body?: unknown
} = {}) {
  return input as Parameters<typeof decisionHandler>[0]
}

function decisionBody(action: 'save' | 'dismiss' | 'approve_and_index', extra: Record<string, unknown> = {}) {
  return {
    action,
    clientId: CLIENT_ID,
    marketLocationId: LOCATION_ID,
    radiusKm: 25,
    ...extra
  }
}

beforeEach(() => {
  runtimeConfig.nearbyMarketDiscoveryEnabled = true
  runtimeConfig.googlePlacesServerApiKey = 'server-places-key'
  mocks.transaction.mockReset().mockImplementation(async callback => callback(transactionExecutor))
  mocks.requireRole.mockReset().mockResolvedValue({ id: USER_ID, role: 'owner' })
  mocks.requireClientAccess.mockReset().mockResolvedValue({ id: USER_ID, role: 'owner' })
  mocks.getCandidate.mockReset().mockResolvedValue(null)
  mocks.getPrimaryLocation.mockReset().mockResolvedValue(confirmedLocation)
  mocks.materializeAndLockCandidate.mockReset().mockResolvedValue(savedCandidate)
  mocks.updateCandidateDecision.mockReset().mockImplementation(async (_clientId, input) => ({
    ...savedCandidate,
    state: input.state,
    approvedDomainId: input.approvedDomainId,
    radiusKmAtDecision: input.radiusKmAtDecision,
    agencyReviewReason: input.agencyReviewReason,
    reviewedAt: input.reviewedAt,
    reviewedByUserId: input.reviewedByUserId
  }))
  mocks.listNominations.mockReset().mockResolvedValue([])
  mocks.enforceRateLimit.mockReset().mockResolvedValue(undefined)
  mocks.reviewCandidateWebsite.mockReset().mockResolvedValue(providerReview)
  mocks.assertPublicOrigin.mockReset().mockResolvedValue('https://dealer.example.com')
  mocks.findDomain.mockReset().mockResolvedValue(null)
  mocks.lockDomainOrigin.mockReset().mockResolvedValue(undefined)
  mocks.getDomainForClient.mockReset().mockResolvedValue(domain)
  mocks.createDomain.mockReset().mockResolvedValue(domain)
  mocks.getDomainRunState.mockReset().mockResolvedValue({ hasRun: false, run: null })
  mocks.writeAudit.mockReset().mockResolvedValue('audit-id')
  mocks.startCrawl.mockReset().mockResolvedValue({
    status: 'started',
    run: { id: RUN_ID, domainId: DOMAIN_ID, status: 'running' }
  })
})

describe('agency candidate decisions', () => {
  it('materializes the tenant conflict target before taking the tuple row lock', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: savedCandidate.id,
          client_id: CLIENT_ID,
          market_location_id: LOCATION_ID,
          google_place_id: 'candidate-place',
          state: 'saved',
          source: 'agency',
          approved_domain_id: null,
          radius_km_at_decision: 25,
          nomination_reason: null,
          nominated_at: null,
          nominated_by_client_user_id: null,
          agency_review_reason: null,
          reviewed_at: null,
          reviewed_by_user_id: null,
          created_at: savedCandidate.createdAt,
          updated_at: savedCandidate.updatedAt
        }]
      })

    await expect(actualCandidateRepository.materializeAndLockNearbyMarketCandidate(
      CLIENT_ID,
      { marketLocationId: LOCATION_ID, googlePlaceId: 'candidate-place', radiusKmAtDecision: 25 },
      { query }
    )).resolves.toMatchObject({ id: savedCandidate.id, state: 'saved' })

    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0]?.[0]).toMatch(/INSERT INTO site_intelligence_candidates[\s\S]*ON CONFLICT[\s\S]*DO NOTHING/i)
    expect(query.mock.calls[0]?.[1]).toEqual([CLIENT_ID, LOCATION_ID, 'candidate-place', 25])
    expect(query.mock.calls[1]?.[0]).toMatch(/client_id = \$1[\s\S]*market_location_id = \$2[\s\S]*google_place_id = \$3[\s\S]*FOR UPDATE/i)
    expect(query.mock.calls[1]?.[1]).toEqual([CLIENT_ID, LOCATION_ID, 'candidate-place'])
  })

  it('uses an optional domain executor without opening a nested transaction', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          id: DOMAIN_ID,
          client_id: CLIENT_ID,
          lane: 'competitor',
          name: 'dealer.example.com',
          origin: 'https://dealer.example.com',
          justification: 'Monitor this nearby competitor.',
          approved_by: USER_ID,
          approved_at: domain.approvedAt,
          status: 'active',
          discovery_mode: 'sitemaps',
          include_patterns: [],
          exclude_patterns: [],
          include_subdomains: false,
          render_mode: 'auto',
          page_limit: 25,
          crawl_depth: 1,
          frequency: 'manual',
          crawl_purposes: ['search'],
          ai_input_allowed: false,
          retention_days: 30,
          last_run_at: null,
          next_run_at: null,
          latest_run_status: null,
          created_at: domain.createdAt,
          updated_at: domain.updatedAt
        }]
      })
      .mockResolvedValueOnce({ rows: [{ id: 'audit-id' }] })

    await expect(actualDomainRepository.createSiteIntelligenceDomain(
      { id: USER_ID },
      {
        clientId: CLIENT_ID,
        lane: 'competitor',
        name: 'dealer.example.com',
        origin: 'https://dealer.example.com',
        justification: 'Monitor this nearby competitor.',
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
      },
      { query }
    )).resolves.toMatchObject({ id: DOMAIN_ID, name: 'dealer.example.com' })

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]?.[0]).toContain('INSERT INTO site_intelligence_domains')
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      { id: USER_ID },
      CLIENT_ID,
      'domain.created',
      'domain',
      DOMAIN_ID,
      expect.any(Object),
      { query }
    )
  })

  it('rejects non-admin and portal-shaped callers before client, provider, or transaction work', async () => {
    mocks.requireRole.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))

    await expect(decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('save')
    }))).rejects.toMatchObject({ statusCode: 403 })

    expect(mocks.requireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(mocks.requireClientAccess).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.reviewCandidateWebsite).not.toHaveBeenCalled()
  })

  it('rejects inaccessible clients, invalid decisions, and stale location IDs before DB writes', async () => {
    mocks.requireClientAccess.mockRejectedValue(
      Object.assign(new Error('No access to this client'), { statusCode: 403 })
    )
    await expect(decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('save')
    }))).rejects.toMatchObject({ statusCode: 403 })

    mocks.requireClientAccess.mockResolvedValue({ id: USER_ID, role: 'owner' })
    await expect(decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('dismiss')
    }))).rejects.toMatchObject({ statusCode: 400 })

    await expect(decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: { ...decisionBody('save'), marketLocationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
    }))).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('re-fetches and validates the current Google website before entering the approval transaction', async () => {
    await decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('approve_and_index', {
        reviewerReason: 'Monitor this nearby competitor.'
      })
    }))

    expect(mocks.reviewCandidateWebsite).toHaveBeenCalledWith('candidate-place')
    expect(mocks.assertPublicOrigin).toHaveBeenCalledWith('https://Dealer.Example.com/offers')
    expect(mocks.assertPublicOrigin.mock.invocationCallOrder[0]!)
      .toBeLessThan(mocks.transaction.mock.invocationCallOrder[0]!)
  })

  it('rejects mismatched Place details and missing provider websites with redacted errors', async () => {
    mocks.reviewCandidateWebsite.mockResolvedValue({ ...providerReview, placeId: 'other-place' })
    await expect(decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('approve_and_index', { reviewerReason: 'Review mismatch safely.' })
    }))).rejects.toMatchObject({ statusCode: 502 })

    mocks.reviewCandidateWebsite.mockResolvedValue({ ...providerReview, websiteUri: null })
    await expect(decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('approve_and_index', { reviewerReason: 'No public site is available.' })
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.not.stringMatching(/Provider Street|Google Dealer|sensitive provider response/i)
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('validates a manual website without requesting Google and rejects private origins before the transaction', async () => {
    await decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('approve_and_index', {
        reviewerReason: 'Use the manually confirmed corporate site.',
        websiteUri: 'https://manual.example.com/offers'
      })
    }))

    expect(mocks.reviewCandidateWebsite).not.toHaveBeenCalled()
    expect(mocks.assertPublicOrigin).toHaveBeenCalledWith('https://manual.example.com/offers')

    mocks.assertPublicOrigin.mockRejectedValue(new Error('private IP 10.0.0.2'))
    await expect(decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('approve_and_index', {
        reviewerReason: 'Reject this private service.',
        websiteUri: 'http://10.0.0.2/internal'
      })
    }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Public HTTP(S) origin required'
    })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })

  it('persists hostname-derived fixed pilot defaults and the reviewer reason through the existing domain creator', async () => {
    mocks.assertPublicOrigin.mockResolvedValue('https://www.dealer.example.com')

    await decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('approve_and_index', {
        reviewerReason: 'Monitor public offers for this approved competitor.'
      })
    }))

    expect(mocks.createDomain).toHaveBeenCalledWith(
      { id: USER_ID, role: 'owner' },
      {
        clientId: CLIENT_ID,
        lane: 'competitor',
        name: 'www.dealer.example.com',
        origin: 'https://www.dealer.example.com',
        justification: 'Monitor public offers for this approved competitor.',
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
      },
      transactionExecutor
    )
    expect(mocks.lockDomainOrigin).toHaveBeenCalledWith(
      CLIENT_ID,
      'https://www.dealer.example.com',
      'competitor',
      transactionExecutor
    )
    expect(mocks.lockDomainOrigin.mock.invocationCallOrder[0]!)
      .toBeLessThan(mocks.findDomain.mock.invocationCallOrder[0]!)
    expect(mocks.startCrawl).toHaveBeenCalledWith(
      expect.anything(),
      { id: USER_ID, role: 'owner' },
      DOMAIN_ID,
      'manual',
      { onlyIfNeverRun: true }
    )
    expect(JSON.stringify(mocks.createDomain.mock.calls[0]?.[1]))
      .not.toContain('Transient Google Dealer Name')
  })

  it('links an existing tenant competitor domain without duplicating it or its first crawl', async () => {
    mocks.findDomain.mockResolvedValue(domain)
    mocks.getDomainRunState.mockResolvedValue({
      hasRun: true,
      run: { id: RUN_ID, status: 'completed' }
    })

    const result = await decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('approve_and_index', {
        reviewerReason: 'Link the already governed competitor.'
      })
    }))

    expect(mocks.createDomain).not.toHaveBeenCalled()
    expect(mocks.updateCandidateDecision).toHaveBeenCalledWith(
      CLIENT_ID,
      expect.objectContaining({ state: 'approved', approvedDomainId: DOMAIN_ID }),
      transactionExecutor
    )
    expect(mocks.startCrawl).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      domain: { id: DOMAIN_ID },
      run: { id: RUN_ID, status: 'completed' },
      crawlStart: null
    })
  })

  it('returns an already-approved candidate and run state without repeating approval or crawl start', async () => {
    const approvedCandidate = {
      ...savedCandidate,
      state: 'approved' as const,
      approvedDomainId: DOMAIN_ID
    }
    mocks.getCandidate.mockResolvedValue(approvedCandidate)
    mocks.materializeAndLockCandidate.mockResolvedValue(approvedCandidate)
    mocks.getDomainRunState.mockResolvedValue({
      hasRun: true,
      run: { id: RUN_ID, status: 'failed' }
    })

    const result = await decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('approve_and_index', {
        reviewerReason: 'Retry the already approved competitor safely.'
      })
    }))

    expect(result).toMatchObject({
      candidate: { state: 'approved', approvedDomainId: DOMAIN_ID },
      domain: { id: DOMAIN_ID },
      run: { id: RUN_ID, status: 'failed' },
      crawlStart: null
    })
    expect(mocks.createDomain).not.toHaveBeenCalled()
    expect(mocks.reviewCandidateWebsite).not.toHaveBeenCalled()
    expect(mocks.assertPublicOrigin).not.toHaveBeenCalled()
    expect(mocks.updateCandidateDecision).not.toHaveBeenCalled()
    expect(mocks.writeAudit).not.toHaveBeenCalled()
    expect(mocks.startCrawl).not.toHaveBeenCalled()
  })

  it('appends safe audit events for every save and dismiss decision, including repeats', async () => {
    await decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('save')
    }))
    await decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('save')
    }))
    await decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('dismiss', { reviewerReason: 'Outside the approved pilot market.' })
    }))
    await decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('dismiss', { reviewerReason: 'Outside the approved pilot market.' })
    }))

    expect(mocks.writeAudit.mock.calls.map(call => call[2])).toEqual([
      'candidate.saved',
      'candidate.saved',
      'candidate.dismissed',
      'candidate.dismissed'
    ])
    for (const call of mocks.writeAudit.mock.calls) {
      expect(JSON.stringify(call[5])).not.toMatch(/website|origin|provider|reason/i)
    }
    expect(mocks.reviewCandidateWebsite).not.toHaveBeenCalled()
    expect(mocks.startCrawl).not.toHaveBeenCalled()
  })

  it('serializes distinct Place approvals sharing one origin into one domain and one first-run claim', async () => {
    const candidateByPlace = new Map<string, typeof savedCandidate>()
    let sharedDomain: typeof domain | null = null
    let domainCreates = 0
    let firstRunClaims = 0
    let originLockTail = Promise.resolve()

    mocks.transaction.mockImplementation(async (callback) => {
      const db = { query: vi.fn(), releaseOriginLock: undefined as undefined | (() => void) }
      try {
        return await callback(db)
      } finally {
        db.releaseOriginLock?.()
      }
    })
    mocks.lockDomainOrigin.mockImplementation(async (_clientId, _origin, _lane, db) => {
      const previous = originLockTail
      let release!: () => void
      originLockTail = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous
      db.releaseOriginLock = release
    })
    mocks.materializeAndLockCandidate.mockImplementation(async (_clientId, input) => {
      const candidate = candidateByPlace.get(input.googlePlaceId) ?? {
        ...savedCandidate,
        id: `candidate-${input.googlePlaceId}`,
        googlePlaceId: input.googlePlaceId
      }
      candidateByPlace.set(input.googlePlaceId, candidate)
      return { ...candidate }
    })
    mocks.updateCandidateDecision.mockImplementation(async (_clientId, input) => {
      const current = candidateByPlace.get(input.googlePlaceId)!
      const updated = {
        ...current,
        state: input.state,
        approvedDomainId: input.approvedDomainId,
        agencyReviewReason: input.agencyReviewReason,
        reviewedAt: input.reviewedAt,
        reviewedByUserId: input.reviewedByUserId
      }
      candidateByPlace.set(input.googlePlaceId, updated)
      return { ...updated }
    })
    mocks.findDomain.mockImplementation(async () => {
      const snapshot = sharedDomain
      await Promise.resolve()
      return snapshot
    })
    mocks.createDomain.mockImplementation(async () => {
      domainCreates += 1
      sharedDomain = domain
      return domain
    })
    mocks.reviewCandidateWebsite.mockImplementation(async placeId => ({
      ...providerReview,
      placeId
    }))
    mocks.startCrawl.mockImplementation(async (_event, _user, _domainId, _trigger, options) => {
      expect(options).toEqual({ onlyIfNeverRun: true })
      if (firstRunClaims > 0) {
        return { status: 'existing_run', run: { id: RUN_ID, status: 'running' } }
      }
      firstRunClaims += 1
      return { status: 'started', run: { id: RUN_ID, domainId: DOMAIN_ID, status: 'running' } }
    })

    const request = (placeId: string) => decisionHandler(event({
      params: { placeId },
      body: decisionBody('approve_and_index', {
        reviewerReason: 'Approve the selected competitor once.'
      })
    }))
    const [first, second] = await Promise.all([
      request('candidate-place-a'),
      request('candidate-place-b')
    ])

    expect(domainCreates).toBe(1)
    expect(firstRunClaims).toBe(1)
    expect(mocks.lockDomainOrigin).toHaveBeenCalledTimes(2)
    expect(mocks.startCrawl).toHaveBeenCalledTimes(2)
    expect(mocks.writeAudit.mock.calls.filter(call => call[2] === 'candidate.approved')).toHaveLength(2)
    expect(first.candidate.approvedDomainId).toBe(DOMAIN_ID)
    expect(second.candidate.approvedDomainId).toBe(DOMAIN_ID)
  })

  it('keeps approval committed and exposes safe diagnostics when the first crawl cannot start', async () => {
    mocks.startCrawl.mockResolvedValue({
      status: 'failed',
      run: { id: RUN_ID },
      category: 'workflow_start'
    })

    const result = await decisionHandler(event({
      params: { placeId: 'candidate-place' },
      body: decisionBody('approve_and_index', {
        reviewerReason: 'Approve even if the external workflow is unavailable.'
      })
    }))

    expect(result).toMatchObject({
      candidate: { state: 'approved', approvedDomainId: DOMAIN_ID },
      domain: { id: DOMAIN_ID },
      run: { id: RUN_ID },
      crawlStart: { status: 'failed', category: 'workflow_start' }
    })
    expect(JSON.stringify(result)).not.toMatch(/sensitive|provider response|credential|api.?key/i)
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      { id: USER_ID, role: 'owner' },
      CLIENT_ID,
      'candidate.approved',
      'candidate',
      savedCandidate.id,
      expect.any(Object),
      transactionExecutor
    )
  })
})

describe('agency nomination queue', () => {
  it('returns persisted queue metadata without requesting current Google website details', async () => {
    const nomination = {
      id: savedCandidate.id,
      clientId: CLIENT_ID,
      clientName: 'Example Motors',
      marketLocationId: LOCATION_ID,
      marketLocationLabel: 'Main showroom',
      googlePlaceId: 'candidate-place',
      state: 'nominated',
      source: 'client_portal',
      nominationReason: 'This dealer competes in our area.',
      nominatedAt: '2026-08-01T00:00:00.000Z',
      nominatedByClientUserId: '66666666-6666-4666-8666-666666666666',
      nominatedByName: 'Client Reviewer',
      approvedDomainId: null,
      updatedAt: '2026-08-01T00:00:00.000Z'
    }
    mocks.listNominations.mockResolvedValue([nomination])

    await expect(nominationsHandler(event({ query: { clientId: CLIENT_ID } })))
      .resolves.toEqual({ nominations: [nomination] })

    expect(mocks.requireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(mocks.requireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID)
    expect(mocks.listNominations).toHaveBeenCalledWith(CLIENT_ID)
    expect(mocks.reviewCandidateWebsite).not.toHaveBeenCalled()
    expect(mocks.assertPublicOrigin).not.toHaveBeenCalled()
    expect(JSON.stringify(nomination)).not.toMatch(/websiteUri|canonicalOrigin|displayName/i)
  })
})
