import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getQuery: (event: unknown) => Record<string, unknown>
  getRouterParam: (event: unknown, key: string) => string | undefined
  createError: (options: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getQuery = event => (event as { query?: Record<string, unknown> }).query ?? {}
testGlobal.getRouterParam = (event, key) => (event as { params?: Record<string, string> }).params?.[key]
testGlobal.createError = options => Object.assign(new Error(options.statusMessage), options)

const mockRequireScope = vi.fn()
const mockOverview = vi.fn()
const mockChanges = vi.fn()
const mockGaps = vi.fn()
const mockRun = vi.fn()

vi.mock('~~/server/utils/tracking/analytics-access', () => ({
  requireTrackingAudienceScope: (...args: unknown[]) => mockRequireScope(...args),
  isUuid: (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}))

vi.mock('~~/server/utils/siteIntelligence/repository', () => ({
  getSiteIntelligenceOverviewRead: (...args: unknown[]) => mockOverview(...args),
  listSiteIntelligenceChangesRead: (...args: unknown[]) => mockChanges(...args),
  getSiteIntelligenceGapsRead: (...args: unknown[]) => mockGaps(...args),
  getSiteIntelligenceRunRead: (...args: unknown[]) => mockRun(...args)
}))

const { default: overviewHandler } = await import(
  '../../../../server/api/agency/site-intelligence/overview.get'
)
const { default: changesHandler } = await import(
  '../../../../server/api/agency/site-intelligence/changes.get'
)
const { default: gapsHandler } = await import(
  '../../../../server/api/agency/site-intelligence/gaps.get'
)
const { default: runHandler } = await import(
  '../../../../server/api/agency/site-intelligence/runs/[id].get'
)

const CLIENT_A = '11111111-1111-4111-8111-111111111111'
const RUN_A = '22222222-2222-4222-8222-222222222222'

function event(input: { query?: Record<string, unknown>, params?: Record<string, string> } = {}) {
  return input as Parameters<typeof overviewHandler>[0]
}

beforeEach(() => {
  mockRequireScope.mockReset().mockResolvedValue({
    user: { id: 'user-a', role: 'media_buyer' },
    accessibleClientIds: [CLIENT_A],
    clientIds: [CLIENT_A]
  })
  mockOverview.mockReset().mockResolvedValue({ generatedAt: '2026-08-01T00:00:00.000Z' })
  mockChanges.mockReset().mockResolvedValue({ rows: [], pagination: { cursor: null, hasMore: false } })
  mockGaps.mockReset().mockResolvedValue({ rows: [] })
  mockRun.mockReset().mockResolvedValue({ id: RUN_A })
})

describe('site intelligence read APIs', () => {
  it('resolves scoped access before forwarding overview filters', async () => {
    await overviewHandler(event({ query: {
      clientId: CLIENT_A,
      from: '2026-07-03',
      to: '2026-08-01',
      lane: 'competitor'
    } }))

    expect(mockRequireScope).toHaveBeenCalledWith(expect.anything(), CLIENT_A)
    expect(mockOverview).toHaveBeenCalledWith(expect.objectContaining({
      clientIds: [CLIENT_A],
      lane: 'competitor',
      range: expect.objectContaining({ fromDate: '2026-07-03', toDate: '2026-08-01' })
    }))
    expect(mockRequireScope.mock.invocationCallOrder[0]).toBeLessThan(mockOverview.mock.invocationCallOrder[0]!)
  })

  it('preserves management-wide scope without constructing an unrestricted id list', async () => {
    mockRequireScope.mockResolvedValue({
      user: { id: 'owner-a', role: 'owner' },
      accessibleClientIds: null,
      clientIds: null
    })

    await overviewHandler(event())

    expect(mockOverview).toHaveBeenCalledWith(expect.objectContaining({ clientIds: null }))
  })

  it('rejects inaccessible clients without querying intelligence data', async () => {
    mockRequireScope.mockRejectedValue(Object.assign(new Error('No access'), { statusCode: 403 }))

    await expect(overviewHandler(event({ query: { clientId: CLIENT_A } }))).rejects.toMatchObject({ statusCode: 403 })
    expect(mockOverview).not.toHaveBeenCalled()
  })

  it('validates lane and bounded date ranges before repository reads', async () => {
    await expect(overviewHandler(event({ query: { lane: 'all-websites' } }))).rejects.toMatchObject({ statusCode: 400 })
    await expect(overviewHandler(event({ query: { from: '2026-01-01', to: '2026-08-01' } }))).rejects.toMatchObject({ statusCode: 400 })
    expect(mockOverview).not.toHaveBeenCalled()
  })

  it('forwards allowlisted change filters and caps pagination at 100', async () => {
    await changesHandler(event({ query: {
      clientId: CLIENT_A,
      from: '2026-07-03',
      to: '2026-08-01',
      lane: 'owned',
      changeType: 'facts_changed',
      cursor: '2026-07-31T00:00:00.000Z|33333333-3333-4333-8333-333333333333',
      limit: '999'
    } }) as Parameters<typeof changesHandler>[0])

    expect(mockChanges).toHaveBeenCalledWith(expect.objectContaining({
      clientIds: [CLIENT_A],
      lane: 'owned',
      changeType: 'facts_changed',
      limit: 100,
      cursor: {
        observedAt: '2026-07-31T00:00:00.000Z',
        id: '33333333-3333-4333-8333-333333333333'
      }
    }))
  })

  it('rejects unknown change filters instead of interpolating them', async () => {
    await expect(changesHandler(event({ query: { changeType: 'observed_at DESC; DROP TABLE' } }) as Parameters<typeof changesHandler>[0]))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mockChanges).not.toHaveBeenCalled()
  })

  it('caps gap responses at 50 and returns no competitor performance keys', async () => {
    mockGaps.mockResolvedValue({
      generatedAt: '2026-08-01T00:00:00.000Z',
      rows: [{ key: 'offer:h6', type: 'offer', evidenceUrls: ['https://competitor.example/h6'] }]
    })
    const response = await gapsHandler(event({ query: { clientId: CLIENT_A, limit: '500' } }) as Parameters<typeof gapsHandler>[0])

    expect(mockGaps).toHaveBeenCalledWith(expect.objectContaining({ limit: 50, clientIds: [CLIENT_A] }))
    expect(JSON.stringify(response)).not.toMatch(/competitor(?:Visitor|Audience|Conversion|Reach|Spend)/i)
  })

  it('loads run diagnostics only through the authorised scope and never returns raw storage fields', async () => {
    const response = await runHandler(event({ params: { id: RUN_A }, query: { clientId: CLIENT_A } }) as Parameters<typeof runHandler>[0])

    expect(mockRequireScope).toHaveBeenCalledWith(expect.anything(), CLIENT_A)
    expect(mockRun).toHaveBeenCalledWith({ clientIds: [CLIENT_A], runId: RUN_A })
    expect(JSON.stringify(response)).not.toMatch(/r2ObjectKey|r2_object_key|rawText|rawBody/i)
  })

  it('returns 404 for an inaccessible or missing run without leaking existence', async () => {
    mockRun.mockResolvedValue(null)
    await expect(runHandler(event({ params: { id: RUN_A } }) as Parameters<typeof runHandler>[0]))
      .rejects.toMatchObject({ statusCode: 404 })
  })
})
