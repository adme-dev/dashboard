import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockQuery: Record<string, unknown> = { platform: 'google', month: 8, year: 2026 }

vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...args: unknown[]) => mockRequireAuth(...args) }))
vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))
vi.mock('~~/server/utils/kv', () => ({
  cachedFetch: (_event: unknown, _key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher()
}))

const testGlobals = globalThis as unknown as Record<string, unknown>
testGlobals.eventHandler = <T>(fn: T) => fn
testGlobals.getQuery = () => mockQuery

const campaign = (id: number) => ({
  id: `spend-${id}`,
  campaign_id: `campaign-${id}`,
  campaign_name: `Campaign ${id}`,
  campaign_type: 'SEARCH',
  campaign_status: 'ENABLED',
  actual_spend: '10',
  budget_allocated: '0',
  impressions: '100',
  clicks: '10'
})

describe('GET /api/agency/social/campaign-daily-spend estimation provenance', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
  })

  it('does not mark a real Other bucket as estimated', async () => {
    const top = Array.from({ length: 10 }, (_, index) => campaign(index + 1))
    mockQueryRows
      .mockResolvedValueOnce(top)
      .mockResolvedValueOnce(top.map(row => ({
        media_spend_id: row.id,
        spend_date: '2026-08-01',
        spend: '10',
        impressions: '100',
        clicks: '10'
      })))
      .mockResolvedValueOnce([{
        spend_date: '2026-08-01',
        total_spend: '5',
        total_impressions: '50',
        total_clicks: '5'
      }])
      .mockResolvedValueOnce([{
        spend_date: '2026-08-01',
        total_spend: '105',
        total_impressions: '1050',
        total_clicks: '105',
        total_conversions: '2',
        total_revenue: '50'
      }])
    mockQueryOne
      .mockResolvedValueOnce({ cnt: '11' })
      .mockResolvedValueOnce({ total: '5' })
      .mockResolvedValueOnce({ total_budget: '0' })

    const handler = (await import('~~/server/api/agency/social/campaign-daily-spend.get')).default
    const result = await handler({} as never)

    expect(result.campaigns.at(-1)?.campaignId).toBe('__other__')
    expect(result.estimated).toBe(false)
  })

  it('marks generated flat daily rows as estimated', async () => {
    mockQueryRows
      .mockResolvedValueOnce([campaign(1)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    mockQueryOne
      .mockResolvedValueOnce({ cnt: '1' })
      .mockResolvedValueOnce({ total_budget: '0' })

    const handler = (await import('~~/server/api/agency/social/campaign-daily-spend.get')).default
    const result = await handler({} as never)

    expect(result.campaigns[0]?.daily.length).toBeGreaterThan(0)
    expect(result.estimated).toBe(true)
  })
})
