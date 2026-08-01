import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockQueryRows = vi.fn()
const mockCachedFetch = vi.fn(async (_event, _key, _ttl, fetcher) => fetcher())
let mockQuery: Record<string, unknown> = { month: 6, year: 2026 }

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/kv', () => ({
  cachedFetch: (...args: unknown[]) => mockCachedFetch(...args),
}))

;(globalThis as any).eventHandler = (fn: any) => fn
;(globalThis as any).getQuery = () => mockQuery

describe('social account spend endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = { month: 6, year: 2026 }
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-1')
    mockQueryRows
      .mockResolvedValueOnce([
        {
          id: 'connection-1',
          account_id: 'act_1',
          account_name: 'Archived account with current spend',
          status: 'expired',
          metadata: {},
          client_id: 'client-1',
          client_name: 'Client 1',
          total_spend: '100',
          total_budget: '500',
          total_impressions: '1000',
          total_clicks: '50',
          total_conversions: '3',
          total_commission: '0',
          max_commission_rate: '0',
          campaign_count: 1,
          last_synced_at: '2026-06-20T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'unlinked:meta:client:client-2',
          account_id: 'unlinked:meta:client:client-2',
          account_name: 'Client 2 (unlinked spend)',
          status: 'unlinked',
          metadata: { source: 'media_spend' },
          client_id: 'client-2',
          client_name: 'Client 2',
          total_spend: '200',
          total_budget: '700',
          total_impressions: '2000',
          total_clicks: '80',
          total_conversions: '4',
          total_commission: '0',
          max_commission_rate: '0',
          campaign_count: 2,
          last_synced_at: '2026-06-21T00:00:00.000Z',
        },
      ])
  })

  it('keeps Meta accounts visible when they have spend rows for the selected period even if the connection is not active', async () => {
    const handler = (await import('~~/server/api/agency/social/meta/account-spend.get')).default

    const result = await handler({} as any)

    expect(String(mockQueryRows.mock.calls[0][0])).toContain("(sc.status = 'active' OR ms.id IS NOT NULL)")
    expect(String(mockQueryRows.mock.calls[1][0])).toContain("ms.connection_id IS NULL")
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'expired', totalBudget: 500, totalSpend: 100 }),
      expect.objectContaining({ status: 'unlinked', totalBudget: 700, totalSpend: 200 }),
    ]))
  })

  it('keeps Google accounts visible when they have spend rows for the selected period even if the connection is not active', async () => {
    const handler = (await import('~~/server/api/agency/social/google/account-spend.get')).default

    const result = await handler({} as any)

    expect(String(mockQueryRows.mock.calls[0][0])).toContain("(sc.status = 'active' OR ms.id IS NOT NULL)")
    expect(String(mockQueryRows.mock.calls[1][0])).toContain("ms.connection_id IS NULL")
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'expired', totalBudget: 500, totalSpend: 100 }),
      expect.objectContaining({ status: 'unlinked', totalBudget: 700, totalSpend: 200 }),
    ]))
  })

  it('returns Meta campaign rows for a synthetic unlinked client group', async () => {
    mockQuery = {
      connectionId: 'unlinked:meta:client:11111111-1111-4111-8111-111111111111',
      month: 6,
      year: 2026,
    }
    mockQueryRows.mockReset()
    mockQueryRows
      .mockResolvedValueOnce([
        {
          id: 'spend-1',
          campaign_id: 'campaign-1',
          campaign_name: 'Manual Meta campaign',
          actual_spend: 100,
          budget_allocated: 500,
          budget_rolling: false,
          commission_rate: null,
          impressions: 1000,
          clicks: 50,
          conversions: 3,
          campaign_type: null,
          campaign_status: 'ACTIVE',
          synced_at: '2026-06-20T00:00:00.000Z',
          reach: null,
          cost_per_result: null,
          result_type: null,
          end_date: null,
          bid_strategy: null,
          budget_type: null,
          client_id: '11111111-1111-4111-8111-111111111111',
          frequency: null,
          quality_ranking: null,
          engagement_rate_ranking: null,
          conversion_rate_ranking: null,
          impression_share: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const handler = (await import('~~/server/api/agency/social/meta/account-campaigns.get')).default

    const result = await handler({} as any)

    expect(String(mockQueryRows.mock.calls[0][0])).toContain('connection_id IS NULL')
    expect(mockQueryRows.mock.calls[0][1]).toEqual(['2026-06', '11111111-1111-4111-8111-111111111111'])
    expect(result).toEqual([
      expect.objectContaining({
        id: 'spend-1',
        campaignName: 'Manual Meta campaign',
        budget: 500,
        budgetKey: null,
        budgetActionable: false,
      }),
    ])
  })

  it('returns a canonical budget key for connected Meta campaign rows', async () => {
    mockQuery = { connectionId: 'connection-1', month: 6, year: 2026 }
    mockQueryRows.mockReset()
    mockQueryRows
      .mockResolvedValueOnce([
        {
          id: 'spend-1',
          campaign_id: 'campaign-1',
          campaign_name: 'Connected Meta campaign',
          actual_spend: 100,
          budget_allocated: 500,
          budget_rolling: false,
          commission_rate: null,
          impressions: 1000,
          clicks: 50,
          conversions: 3,
          campaign_type: null,
          campaign_status: 'ACTIVE',
          synced_at: '2026-06-20T00:00:00.000Z',
          reach: null,
          cost_per_result: null,
          result_type: null,
          end_date: null,
          bid_strategy: null,
          budget_type: null,
          client_id: 'client-1',
          connection_id: 'connection-1',
          budget_account_id: 'act-1',
          frequency: null,
          quality_ranking: null,
          engagement_rate_ranking: null,
          conversion_rate_ranking: null,
          impression_share: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const handler = (await import('~~/server/api/agency/social/meta/account-campaigns.get')).default

    const result = await handler({} as any)

    expect(result[0]).toMatchObject({
      budgetKey: 'tenant:tenant-1|client:client-1|platform:meta|account:act-1|campaign:campaign-1|period:2026-06',
      budgetActionable: true,
      budgetIdentityIssues: [],
    })
  })

  it('returns Google campaign rows for a synthetic unlinked unmapped group', async () => {
    mockQuery = { connectionId: 'unlinked:google:unmapped', month: 6, year: 2026 }
    mockQueryRows.mockReset()
    mockQueryRows
      .mockResolvedValueOnce([{
        id: 'spend-1',
        campaign_id: 'campaign-1',
        campaign_name: 'Manual Google campaign',
        actual_spend: 100,
        budget_allocated: 500,
        budget_rolling: false,
        commission_rate: null,
        impressions: 1000,
        clicks: 50,
        conversions: 3,
        campaign_type: null,
        campaign_status: 'ENABLED',
        synced_at: '2026-06-20T00:00:00.000Z',
      }])
      .mockResolvedValueOnce([])
    const handler = (await import('~~/server/api/agency/social/google/account-campaigns.get')).default

    const result = await handler({} as any)

    expect(String(mockQueryRows.mock.calls[0][0])).toContain('connection_id IS NULL')
    expect(String(mockQueryRows.mock.calls[0][0])).toContain('client_id IS NULL')
    expect(mockQueryRows.mock.calls[0][1]).toEqual(['2026-06'])
    expect(result).toEqual([
      expect.objectContaining({
        id: 'spend-1',
        campaignName: 'Manual Google campaign',
        budget: 500,
        budgetKey: null,
        budgetActionable: false,
      }),
    ])
  })

  it('returns a canonical budget key for connected Google campaign rows', async () => {
    mockQuery = { connectionId: 'connection-1', month: 6, year: 2026 }
    mockQueryRows.mockReset()
    mockQueryRows
      .mockResolvedValueOnce([{
        id: 'spend-1',
        campaign_id: 'campaign-1',
        campaign_name: 'Connected Google campaign',
        actual_spend: 100,
        budget_allocated: 500,
        budget_rolling: false,
        commission_rate: null,
        impressions: 1000,
        clicks: 50,
        conversions: 3,
        campaign_type: null,
        campaign_status: 'ENABLED',
        synced_at: '2026-06-20T00:00:00.000Z',
        client_id: 'client-1',
        connection_id: 'connection-1',
        budget_account_id: '123',
      }])
      .mockResolvedValueOnce([])
    const handler = (await import('~~/server/api/agency/social/google/account-campaigns.get')).default

    const result = await handler({} as any)

    expect(result[0]).toMatchObject({
      budgetKey: 'tenant:tenant-1|client:client-1|platform:google_ads|account:123|campaign:campaign-1|period:2026-06',
      budgetActionable: true,
      budgetIdentityIssues: [],
    })
  })
})
