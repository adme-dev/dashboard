import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = { query?: Record<string, string> }

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

const mockRequireRole = vi.fn()
const mockQueryRows = vi.fn()

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = (input) => {
  const error = new Error(input.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = input.statusCode
  error.statusMessage = input.statusMessage
  return error
}

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

vi.mock('~~/server/utils/analyticsCache', async () => {
  const actual = await vi.importActual<typeof import('~~/server/utils/analyticsCache')>('~~/server/utils/analyticsCache')
  return {
    ...actual,
    cachedAnalytics: async (_event: unknown, _key: string, _opts: unknown, fetcher: () => Promise<object>) => ({
      ...(await fetcher()),
      _cache: { generatedAt: '2026-06-29T00:00:00.000Z', provisional: false },
    }),
  }
})

vi.mock('~~/server/utils/channelTaxonomy', () => ({
  resolveCanonicalChannel: async (_kind: string, value: string) => value || null,
}))

const { default: blendedHandler } = await import('../../../../server/api/agency/analytics/blended.get')
const { default: internalBenchmarksHandler } = await import('../../../../server/api/agency/analytics/internal-benchmarks.get')

describe('agency analytics degraded responses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue({ id: 'finance-1', role: 'finance' })
  })

  it('returns an empty degraded blended payload when optional analytics tables are unavailable', async () => {
    mockQueryRows.mockRejectedValueOnce(Object.assign(new Error('relation "ga4_daily_channel" does not exist'), { code: '42P01' }))

    const result = await blendedHandler({
      query: { startDate: '2026-06-01', endDate: '2026-06-30' },
    })

    expect(result).toMatchObject({
      channels: [],
      totals: {
        channel: 'All channels',
        spend: 0,
        leads: 0,
        conversions: 0,
        revenue: 0,
        sessions: 0,
        cpl: null,
        cpa: null,
        roas: null,
      },
      hasGa4: false,
      conversionBasis: 'platform-reported',
      degraded: true,
    })
  })

  it('returns an empty degraded blended payload when optional analytics sources have incompatible schema', async () => {
    mockQueryRows.mockRejectedValueOnce(Object.assign(
      new Error('COALESCE types uuid and character varying cannot be matched in media_spend'),
      { code: '42804' }
    ))

    const result = await blendedHandler({
      query: { startDate: '2026-06-01', endDate: '2026-06-30' },
    })

    expect(result).toMatchObject({
      channels: [],
      totals: {
        channel: 'All channels',
        spend: 0,
        leads: 0,
        conversions: 0,
        revenue: 0,
        sessions: 0,
        cpl: null,
        cpa: null,
        roas: null,
      },
      hasGa4: false,
      conversionBasis: 'platform-reported',
      degraded: true,
    })
  })

  it('returns an empty degraded internal benchmark payload when optional analytics tables are unavailable', async () => {
    mockQueryRows.mockRejectedValueOnce(Object.assign(new Error('relation "daily_spend" does not exist'), { code: '42P01' }))

    const result = await internalBenchmarksHandler({
      query: { startDate: '2026-06-01', endDate: '2026-06-30', clientId: 'client-1' },
    })

    expect(result).toMatchObject({
      window: { startDate: '2026-06-01', endDate: '2026-06-30' },
      clientCount: 0,
      clients: [],
      degraded: true,
    })
    expect(Object.values(result.metrics).every((metric: any) => metric.portfolio.count === 0 && metric.client === null)).toBe(true)
  })

  it('returns an empty degraded internal benchmark payload when optional analytics sources have incompatible schema', async () => {
    mockQueryRows.mockRejectedValueOnce(Object.assign(
      new Error('COALESCE types uuid and character varying cannot be matched in media_spend'),
      { code: '42804' }
    ))

    const result = await internalBenchmarksHandler({
      query: { startDate: '2026-06-01', endDate: '2026-06-30', clientId: 'client-1' },
    })

    expect(result).toMatchObject({
      window: { startDate: '2026-06-01', endDate: '2026-06-30' },
      clientCount: 0,
      clients: [],
      degraded: true,
    })
    expect(Object.values(result.metrics).every((metric: any) => metric.portfolio.count === 0 && metric.client === null)).toBe(true)
  })

  it('keeps unrelated analytics failures visible', async () => {
    mockQueryRows.mockRejectedValueOnce(Object.assign(new Error('connection refused'), { code: '08006' }))

    await expect(blendedHandler({
      query: { startDate: '2026-06-01', endDate: '2026-06-30' },
    })).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Failed to fetch blended metrics',
    })
  })

  it('rejects literal undefined analytics dates before querying blended metrics', async () => {
    await expect(blendedHandler({
      query: { startDate: 'undefined', endDate: 'undefined' },
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'startDate must be a YYYY-MM-DD date',
    })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('rejects literal undefined analytics dates before querying internal benchmarks', async () => {
    await expect(internalBenchmarksHandler({
      query: { startDate: 'undefined', endDate: 'undefined' },
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'startDate must be a YYYY-MM-DD date',
    })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })
})
