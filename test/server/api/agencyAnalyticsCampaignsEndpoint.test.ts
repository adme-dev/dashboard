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

const mockRequireAuth = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

const { default: campaignsHandler } = await import('../../../../server/api/agency/analytics/campaigns.get')

describe('GET /api/agency/analytics/campaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockGetSelectedTenant.mockResolvedValue('tenant-1')
    mockQueryOne.mockResolvedValue({ count: '2' })
    mockQueryRows
      .mockResolvedValueOnce([
        {
          campaign_id: 'shared-campaign-id',
          campaign_name: 'EOFY Leads',
          platform: 'meta',
          campaign_type: 'lead_gen',
          campaign_status: 'ACTIVE',
          client_id: 'client-1',
          client_name: 'Client One',
          spend: '500',
          budget: '1000',
          budget_rolling: false,
          impressions: '1000',
          clicks: '50',
          conversions: '5',
          revenue: '0',
          reach: '900',
          cost_per_result: '100',
          result_type: 'Lead',
          frequency: '1.2',
          quality_ranking: null,
          engagement_rate_ranking: null,
          conversion_rate_ranking: null,
          impression_share: null,
          end_date: null,
          bid_strategy: null,
          budget_type: null,
          last_synced: '2026-06-29T00:00:00.000Z',
          media_spend_id: 'spend-meta',
          connection_id: 'conn-meta',
          budget_account_id: 'act-meta',
          budget_period: '2026-06',
          budget_period_count: '1',
          connection_account_id: 'act-meta',
          connection_metadata: '{}',
          lead_count: '2',
          lead_new_count: '1',
          lead_contacted_count: '1',
          lead_qualified_count: '0',
          lead_won_count: '0',
          lead_lost_count: '0',
          cost_per_lead: '250',
        },
        {
          campaign_id: 'shared-campaign-id',
          campaign_name: 'EOFY Leads',
          platform: 'google_ads',
          campaign_type: 'search',
          campaign_status: 'ENABLED',
          client_id: 'client-2',
          client_name: 'Client Two',
          spend: '700',
          budget: '1500',
          budget_rolling: true,
          impressions: '1200',
          clicks: '60',
          conversions: '6',
          revenue: '0',
          reach: null,
          cost_per_result: null,
          result_type: null,
          frequency: null,
          quality_ranking: null,
          engagement_rate_ranking: null,
          conversion_rate_ranking: null,
          impression_share: null,
          end_date: null,
          bid_strategy: null,
          budget_type: null,
          last_synced: '2026-06-29T00:00:00.000Z',
          media_spend_id: 'spend-google',
          connection_id: 'conn-google',
          budget_account_id: '123',
          budget_period: '2026-06',
          budget_period_count: '1',
          connection_account_id: '123',
          connection_metadata: '{}',
          lead_count: '0',
          lead_new_count: '0',
          lead_contacted_count: '0',
          lead_qualified_count: '0',
          lead_won_count: '0',
          lead_lost_count: '0',
          cost_per_lead: null,
        },
      ])
      .mockResolvedValueOnce([])
  })

  it('returns stable unique row keys and counts grouped campaign rows, not raw campaign IDs', async () => {
    const result = await campaignsHandler({
      query: { startDate: '2026-06-01', endDate: '2026-06-30' },
    })

    expect(String(mockQueryOne.mock.calls[0][0])).not.toContain('COUNT(DISTINCT ms.campaign_id)')
    expect(result.total).toBe(2)
    expect(result.campaigns.map((row: any) => row.campaignId)).toEqual([
      'shared-campaign-id',
      'shared-campaign-id',
    ])
    expect(new Set(result.campaigns.map((row: any) => row.rowKey)).size).toBe(2)
    expect(result.campaigns.map((row: any) => row.rowKey)).toEqual([
      'tenant:tenant-1|client:client-1|platform:meta|account:act-meta|campaign:shared-campaign-id|period:2026-06',
      'tenant:tenant-1|client:client-2|platform:google_ads|account:123|campaign:shared-campaign-id|period:2026-06',
    ])
    expect(result.campaigns.map((row: any) => row.budgetKey)).toEqual([
      'tenant:tenant-1|client:client-1|platform:meta|account:act-meta|campaign:shared-campaign-id|period:2026-06',
      'tenant:tenant-1|client:client-2|platform:google_ads|account:123|campaign:shared-campaign-id|period:2026-06',
    ])
    expect(result.campaigns.every((row: any) => row.budgetActionable === true)).toBe(true)
  })
})
