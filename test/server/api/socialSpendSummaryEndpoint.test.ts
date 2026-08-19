import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockQueryRows = vi.fn()
let mockQuery: Record<string, unknown> = {}

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

vi.mock('~~/server/utils/kv', () => ({
  cachedFetch: (_event: unknown, _key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher(),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).getQuery = () => mockQuery
;(globalThis as any).createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)

describe('GET /api/agency/social/spend/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = { month: 6, year: 2026, platform: 'meta' }
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-1')
    mockQueryRows
      .mockResolvedValueOnce([
        {
          platform: 'meta',
          client_id: 'client-1',
          client_name: 'Ferntree Gully Automotive',
          account_id: 'act-1',
          account_name: 'Ferntree Meta',
          sample_campaign_name: 'Campaign A',
          client_ref: 'xero-1',
          owner_id: null,
          owner_name: null,
          total_budget: '500',
          total_spend: '955.31',
          total_commission: '47.76',
          total_impressions: '1000',
          total_clicks: '50',
          total_conversions: '5',
          campaign_count: 2,
          budgeted_campaign_count: 1,
          last_synced_at: '2026-06-20T00:00:00.000Z',
          oldest_synced_at: '2026-06-10T00:00:00.000Z',
          stale_row_count: 1,
          spend_ids: ['spend-1'],
          is_rolling: false,
          commission_rate: '5',
        },
        {
          platform: 'meta',
          client_id: 'client-1',
          client_name: 'Ferntree Gully Automotive',
          account_id: 'act-2',
          account_name: 'Ferntree Used Cars Meta',
          sample_campaign_name: 'Campaign B',
          client_ref: 'xero-1',
          owner_id: null,
          owner_name: null,
          total_budget: '3000',
          total_spend: '3129.21',
          total_commission: '156.46',
          total_impressions: '4000',
          total_clicks: '120',
          total_conversions: '9',
          campaign_count: 3,
          budgeted_campaign_count: 3,
          last_synced_at: '2026-06-25T00:00:00.000Z',
          oldest_synced_at: '2026-06-22T00:00:00.000Z',
          stale_row_count: 2,
          spend_ids: ['spend-2'],
          is_rolling: true,
          commission_rate: '5',
        },
      ])
      .mockResolvedValueOnce([])
  })

  it('returns one stable summary item per mapped client/platform', async () => {
    const handler = (await import('~~/server/api/agency/social/spend/summary.get')).default

    const result = await handler({} as any)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(String(mockQueryRows.mock.calls[0][0])).toContain('budgeted_campaign_count')
    expect(String(mockQueryRows.mock.calls[0][0])).toContain('MIN(ms.synced_at)')
    expect(String(mockQueryRows.mock.calls[0][0])).toContain("INTERVAL '48 hours'")
    expect(mockQueryRows.mock.calls[0][1]).toEqual(['2026-06', 'tenant-1', 'meta'])
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      groupKey: 'meta:client:client-1',
      clientName: 'Ferntree Gully Automotive',
      budget: 3500,
      spend: 4084.52,
      campaignCount: 5,
      budgetedCampaignCount: 4,
      spendIds: ['spend-1', 'spend-2'],
      oldestSyncedAt: '2026-06-10T00:00:00.000Z',
      staleRowCount: 3,
    })
    expect(result.totals).toMatchObject({
      budget: 3500,
      spend: 4084.52,
      commission: 204.22,
      variance: 584.52,
    })
    expect(result.lastSyncedAt).toBe('2026-06-25T00:00:00.000Z')
  })

  it('redacts credentials from historical sync failures before returning them', async () => {
    mockQueryRows.mockReset()
    mockQueryRows
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        platform: 'meta',
        status: 'failed',
        synced_count: 0,
        total_spend: '0',
        failures: [{
          account: 'A',
          reason: 'https://graph.facebook.com/insights?access_token=provider-secret&limit=500',
        }],
        error: 'Bearer provider-secret',
        started_at: '2026-06-25T00:00:00.000Z',
        finished_at: '2026-06-25T00:01:00.000Z',
        total_accounts: 1,
        processed_accounts: 1,
      }])

    const handler = (await import('~~/server/api/agency/social/spend/summary.get')).default
    const result = await handler({} as any)
    const serialized = JSON.stringify(result.latestSyncJobs)

    expect(serialized).toContain('[redacted]')
    expect(serialized).not.toContain('provider-secret')
  })
})
