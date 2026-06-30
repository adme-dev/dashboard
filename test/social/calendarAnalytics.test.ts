import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, string> }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getQuery = (e: TestEvent) => e.query ?? {}
g.createError = (i: { statusCode: number; statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...a: unknown[]) => mockQueryRows(...a),
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}))

const { default: calendarH } = await import('../../server/api/agency/social/publishing/calendar.get')
const { default: overviewH } = await import('../../server/api/agency/social/publishing/analytics/overview.get')
const { default: wallH } = await import('../../server/api/agency/social/publishing/wall.get')

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ id: 'U1' })
  mockQueryRows.mockResolvedValue([])
  mockQueryOne.mockResolvedValue(null)
})

describe('calendar.get', () => {
  it('requires clientId', async () => {
    await expect(calendarH({ query: {} } as any)).rejects.toThrow('clientId required')
  })
  it('queries posts in the date range and selects a thumbnail', async () => {
    mockQueryRows.mockResolvedValueOnce([{ id: 'P1', thumbnail: 'a.jpg' }])
    const res = await calendarH({ query: { clientId: 'C1', from: '2026-06-01', to: '2026-07-01' } } as any)
    expect(res).toHaveLength(1)
    const [sql, params] = mockQueryRows.mock.calls[0]
    expect(sql).toContain('(media_urls)[1] AS thumbnail')
    expect(params).toEqual(['C1', '2026-06-01', '2026-07-01'])
  })
})

describe('analytics/overview.get', () => {
  it('returns zeroed cards when nothing exists', async () => {
    const res = await overviewH({ query: { clientId: 'C1' } } as any)
    expect(res.counts).toEqual({ published: 0, scheduled: 0, failed: 0, drafts: 0 })
    expect(res.metrics).toEqual({ impressions: 0, engagements: 0, clicks: 0 })
  })
  it('passes through aggregated counts + metrics', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ published: 3, scheduled: 2, failed: 1, drafts: 5 })
      .mockResolvedValueOnce({ impressions: 100, engagements: 20, clicks: 8 })
    const res = await overviewH({ query: { clientId: 'C1' } } as any)
    expect(res.counts.published).toBe(3)
    expect(res.metrics.impressions).toBe(100)
  })
})

describe('wall.get', () => {
  it('requires clientId', async () => {
    await expect(wallH({ query: {} } as any)).rejects.toThrow('clientId required')
  })

  it('queries managed posts with account and metrics aggregates', async () => {
    mockQueryRows.mockResolvedValueOnce([{ id: 'P1', accounts: [], metrics: { impressions: 0 } }])

    const res = await wallH({ query: { clientId: 'C1', limit: '40' } } as any)

    expect(res).toHaveLength(1)
    const [sql, params] = mockQueryRows.mock.calls[0]
    expect(sql).toContain('FROM social_posts p')
    expect(sql).toContain('LEFT JOIN LATERAL')
    expect(sql).toContain('social_post_metrics')
    expect(sql).toContain('social_accounts')
    expect(params).toEqual(['C1', 40])
  })
})
