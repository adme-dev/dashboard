import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRouterParam: (event: unknown, key: string) => string | undefined
  getHeader: (event: unknown, key: string) => string | undefined
  getQuery: (event: unknown) => Record<string, unknown>
  readBody: (event: unknown) => Promise<unknown>
  createError: (options: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getRouterParam = (event, key) => (event as { params?: Record<string, string> }).params?.[key]
testGlobal.getHeader = (event, key) => (event as { headers?: Record<string, string> }).headers?.[key.toLowerCase()]
testGlobal.getQuery = event => (event as { query?: Record<string, unknown> }).query ?? {}
testGlobal.readBody = async event => (event as { body?: unknown }).body
testGlobal.createError = options => Object.assign(new Error(options.statusMessage), options)

const mockRequireRole = vi.fn()
const mockRequireClientAccess = vi.fn()
const mockRequireScope = vi.fn()
const mockGetDomain = vi.fn()
const mockCreateRun = vi.fn()
const mockMarkStarted = vi.fn()
const mockFailRun = vi.fn()
const mockGetConfig = vi.fn()
const mockRecordBatch = vi.fn()
const mockCompleteRun = vi.fn()
const mockAssertPublicOrigin = vi.fn()
const mockStartWorkflow = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args)
}))
vi.mock('~~/server/utils/tracking/analytics-access', () => ({
  isUuid: (value: string | undefined) => /^[0-9a-f-]{36}$/i.test(value || ''),
  requireClientTrackingAccess: (...args: unknown[]) => mockRequireClientAccess(...args),
  requireTrackingAudienceScope: (...args: unknown[]) => mockRequireScope(...args)
}))
vi.mock('~~/server/utils/siteIntelligence/repository', () => ({
  createSiteIntelligenceCrawlRun: (...args: unknown[]) => mockCreateRun(...args),
  markSiteIntelligenceRunWorkflowStarted: (...args: unknown[]) => mockMarkStarted(...args),
  failSiteIntelligenceRun: (...args: unknown[]) => mockFailRun(...args),
  getSiteIntelligenceRunConfig: (...args: unknown[]) => mockGetConfig(...args),
  recordSiteIntelligenceIngestBatch: (...args: unknown[]) => mockRecordBatch(...args),
  completeSiteIntelligenceRun: (...args: unknown[]) => mockCompleteRun(...args),
  getSiteIntelligenceDomainForActor: (...args: unknown[]) => mockGetDomain(...args)
}))
vi.mock('~~/server/utils/siteIntelligence/urlPolicy', () => ({
  assertPublicSiteOrigin: (...args: unknown[]) => mockAssertPublicOrigin(...args)
}))
vi.mock('~~/server/utils/agencyWorkflows/client', () => ({
  startSiteIntelligenceCrawlWorkflow: (...args: unknown[]) => mockStartWorkflow(...args)
}))

const { default: crawlHandler } = await import(
  '../../../../server/api/agency/site-intelligence/domains/[id]/crawl.post'
)
const { default: configHandler } = await import(
  '../../../../server/api/internal/workflows/site-intelligence/runs/[id]/config.get'
)
const { default: ingestHandler } = await import(
  '../../../../server/api/internal/workflows/site-intelligence/runs/[id]/ingest.post'
)
const { default: completeHandler } = await import(
  '../../../../server/api/internal/workflows/site-intelligence/runs/[id]/complete.post'
)

const RUN_ID = '11111111-1111-4111-8111-111111111111'
const DOMAIN_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'

function event(input: Record<string, unknown> = {}) {
  return input as Parameters<typeof crawlHandler>[0]
}

const settings = {
  origin: 'https://www.example.com.au',
  lane: 'competitor',
  discoveryMode: 'sitemaps',
  includePatterns: [],
  excludePatterns: [],
  includeSubdomains: false,
  renderMode: 'auto',
  pageLimit: 100,
  depth: 2,
  crawlPurposes: ['search'],
  aiInputAllowed: false,
  retentionDays: 30
}

beforeEach(() => {
  process.env.SITE_INTELLIGENCE_ENABLED = 'true'
  process.env.WORKFLOW_CALLBACK_SECRET = 'callback-secret'
  mockRequireRole.mockReset().mockResolvedValue({ id: USER_ID, role: 'owner' })
  mockRequireClientAccess.mockReset().mockResolvedValue({ id: USER_ID, role: 'owner' })
  mockRequireScope.mockReset().mockResolvedValue({ clientIds: [CLIENT_ID] })
  mockGetDomain.mockReset().mockResolvedValue({ id: DOMAIN_ID, clientId: CLIENT_ID, status: 'active' })
  mockCreateRun.mockReset().mockResolvedValue({
    status: 'created',
    run: { id: RUN_ID, clientId: CLIENT_ID, domainId: DOMAIN_ID, settings }
  })
  mockMarkStarted.mockReset().mockResolvedValue(undefined)
  mockFailRun.mockReset().mockResolvedValue(undefined)
  mockGetConfig.mockReset().mockResolvedValue({
    id: RUN_ID,
    clientId: CLIENT_ID,
    domainId: DOMAIN_ID,
    trigger: 'manual',
    settings
  })
  mockRecordBatch.mockReset().mockResolvedValue({ replayed: false })
  mockCompleteRun.mockReset().mockResolvedValue({ id: RUN_ID, status: 'completed' })
  mockAssertPublicOrigin.mockReset().mockResolvedValue(settings.origin)
  mockStartWorkflow.mockReset().mockResolvedValue({
    ok: true,
    enabled: true,
    instanceId: `site-intel-${RUN_ID}`
  })
})

describe('manual site intelligence crawl', () => {
  it('creates, revalidates, and starts one authorised active-domain run', async () => {
    const response = await crawlHandler(event({ params: { id: DOMAIN_ID } }))

    expect(mockRequireRole).toHaveBeenCalledWith(expect.anything(), ['owner', 'admin'])
    expect(mockGetDomain).toHaveBeenCalledWith([CLIENT_ID], DOMAIN_ID)
    expect(mockRequireClientAccess).toHaveBeenCalledWith(expect.anything(), CLIENT_ID)
    expect(mockCreateRun).toHaveBeenCalledWith({ id: USER_ID, role: 'owner' }, DOMAIN_ID, 'manual')
    expect(mockAssertPublicOrigin).toHaveBeenCalledWith(settings.origin)
    expect(mockStartWorkflow).toHaveBeenCalledWith(expect.anything(), {
      runId: RUN_ID,
      domainId: DOMAIN_ID,
      clientId: CLIENT_ID,
      trigger: 'manual',
      requestedBy: USER_ID
    })
    expect(mockMarkStarted).toHaveBeenCalledWith(RUN_ID, CLIENT_ID, `site-intel-${RUN_ID}`)
    expect(JSON.stringify(response)).not.toMatch(/secret|token/i)
  })

  it('fails closed when the feature is disabled', async () => {
    process.env.SITE_INTELLIGENCE_ENABLED = 'false'
    await expect(crawlHandler(event({ params: { id: DOMAIN_ID } }))).rejects.toMatchObject({ statusCode: 503 })
    expect(mockCreateRun).not.toHaveBeenCalled()
  })

  it('returns conflict for an existing queued or running crawl', async () => {
    mockCreateRun.mockResolvedValue({ status: 'active_run', run: null })
    await expect(crawlHandler(event({ params: { id: DOMAIN_ID } }))).rejects.toMatchObject({ statusCode: 409 })
    expect(mockStartWorkflow).not.toHaveBeenCalled()
  })

  it('marks the committed run failed when workflow start fails', async () => {
    mockStartWorkflow.mockResolvedValue({ ok: false, enabled: true, reason: 'request_failed', error: 'unreachable' })
    await expect(crawlHandler(event({ params: { id: DOMAIN_ID } }))).rejects.toMatchObject({ statusCode: 502 })
    expect(mockFailRun).toHaveBeenCalledWith(RUN_ID, CLIENT_ID, 'workflow_start', 'unreachable')
  })
})

describe('site intelligence workflow callbacks', () => {
  const auth = { 'x-workflow-secret': 'callback-secret' }

  it('rejects missing or wrong callback authentication', async () => {
    const request = { params: { id: RUN_ID }, query: { clientId: CLIENT_ID, domainId: DOMAIN_ID } }
    await expect(configHandler(event(request) as never)).rejects.toMatchObject({ statusCode: 401 })
    await expect(configHandler(event({ ...request, headers: { 'x-workflow-secret': 'wrong' } }) as never))
      .rejects.toMatchObject({ statusCode: 401 })
    expect(mockGetConfig).not.toHaveBeenCalled()
  })

  it('returns only an immutable matching run snapshot', async () => {
    const response = await configHandler(event({
      params: { id: RUN_ID },
      headers: auth,
      query: { clientId: CLIENT_ID, domainId: DOMAIN_ID }
    }) as never)
    expect(response).toEqual({ run: expect.objectContaining({ id: RUN_ID, settings }) })
    expect(mockGetConfig).toHaveBeenCalledWith(RUN_ID, CLIENT_ID, DOMAIN_ID)
    expect(JSON.stringify(response)).not.toMatch(/secret|token/i)
  })

  it('rejects client, domain, and run mismatches', async () => {
    mockGetConfig.mockResolvedValue(null)
    await expect(configHandler(event({
      params: { id: RUN_ID },
      headers: auth,
      query: { clientId: CLIENT_ID, domainId: DOMAIN_ID }
    }) as never)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('records an idempotent bounded ingest batch', async () => {
    const body = {
      clientId: CLIENT_ID,
      domainId: DOMAIN_ID,
      batchKey: `${RUN_ID}:start:all`,
      records: [{
        url: settings.origin,
        status: 'completed',
        markdown: '# Offer',
        metadata: { status: 200, url: settings.origin }
      }]
    }
    await expect(ingestHandler(event({ params: { id: RUN_ID }, headers: auth, body }) as never))
      .resolves.toEqual({ ok: true, replayed: false })
    expect(mockRecordBatch).toHaveBeenCalledWith(RUN_ID, body)
  })

  it('accepts only documented terminal completion states', async () => {
    const body = {
      clientId: CLIENT_ID,
      domainId: DOMAIN_ID,
      status: 'partial',
      cloudflareJobId: 'job-1',
      totalPages: 2,
      completedPages: 1,
      disallowedPages: 1,
      erroredPages: 0,
      browserSeconds: 1.2
    }
    await expect(completeHandler(event({ params: { id: RUN_ID }, headers: auth, body }) as never))
      .resolves.toEqual({ run: { id: RUN_ID, status: 'completed' } })
    expect(mockCompleteRun).toHaveBeenCalledWith(RUN_ID, body)

    await expect(completeHandler(event({
      params: { id: RUN_ID },
      headers: auth,
      body: { ...body, status: 'running' }
    }) as never)).rejects.toMatchObject({ statusCode: 400 })
  })
})
