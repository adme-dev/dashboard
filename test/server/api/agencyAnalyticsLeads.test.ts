import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  setResponseHeader: (...args: unknown[]) => void
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.setResponseHeader = vi.fn()
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: vi.fn().mockResolvedValue('tenant-1')
}))

vi.mock('~~/server/utils/analyticsCache', () => ({
  analyticsCacheKey: (...args: unknown[]) => args.map(String).join(':'),
  cachedAnalytics: (_event: unknown, _key: string, _options: unknown, fetcher: () => Promise<unknown>) => fetcher()
}))

vi.mock('~~/server/utils/platformDeepLinks', () => ({
  buildCampaignDeepLink: () => null
}))

const { default: campaignsHandler } = await import(
  '../../../../server/api/agency/analytics/campaigns.get'
)
const { default: overviewHandler } = await import(
  '../../../../server/api/agency/analytics/overview.get'
)
const { default: trendsHandler } = await import(
  '../../../../server/api/agency/analytics/trends.get'
)
const { default: exportHandler } = await import(
  '../../../../server/api/agency/analytics/export.get'
)

describe('agency analytics lead metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({ count: '0' })
  })

  it('adds all matching lead metrics to campaign rows without portal visibility filtering', async () => {
    mockQueryOne.mockResolvedValueOnce({ count: '1' })
    mockQueryRows.mockResolvedValueOnce([
      {
        campaign_id: 'camp-1',
        campaign_name: 'Search Leads',
        platform: 'google_ads',
        campaign_type: 'SEARCH',
        campaign_status: 'ENABLED',
        client_id: 'client-1',
        client_name: 'Client One',
        spend: '200',
        budget: '500',
        budget_rolling: false,
        impressions: '1000',
        clicks: '100',
        conversions: '5',
        revenue: '0',
        media_spend_id: 'ms-1',
        lead_count: '8',
        lead_new_count: '3',
        lead_contacted_count: '2',
        lead_qualified_count: '1',
        lead_won_count: '1',
        lead_lost_count: '1',
        cost_per_lead: '25'
      }
    ])

    const result = await campaignsHandler({
      query: {
        startDate: '2026-05-01',
        endDate: '2026-05-27',
        sortBy: 'cost_per_lead'
      }
    })

    expect(result.campaigns[0]).toMatchObject({
      leadCount: 8,
      leadNewCount: 3,
      leadContactedCount: 2,
      leadWonCount: 1,
      costPerLead: 25
    })
    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('FROM leads l')
    expect(sql).not.toContain('destination_type = \'portal\'')
    expect(sql).toContain('ORDER BY cost_per_lead DESC')
  })

  it('adds all matching lead totals to agency overview', async () => {
    mockQueryRows
      .mockResolvedValueOnce([{ platform: 'meta', spend: '100', budget: '200', impressions: '1000', clicks: '50', conversions: '2', revenue: '0', campaign_count: '1', rolling_count: '0' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ spend: '80', budget: '150', impressions: '800', clicks: '40', conversions: '1', revenue: '0' }])
      .mockResolvedValueOnce([{ lead_count: '10', lead_new_count: '4', lead_contacted_count: '3', lead_qualified_count: '1', lead_won_count: '1', lead_lost_count: '1', avg_response_minutes: '30' }])
      .mockResolvedValueOnce([{ lead_count: '5', lead_new_count: '2', lead_contacted_count: '1', lead_qualified_count: '1', lead_won_count: '1', lead_lost_count: '0' }])

    const result = await overviewHandler({
      query: { startDate: '2026-05-01', endDate: '2026-05-27' }
    })

    expect(result.totals).toMatchObject({
      leads: 10,
      leadNew: 4,
      leadContacted: 3,
      costPerLead: 10,
      avgResponseMinutes: 30
    })
    expect(result.previousPeriod).toMatchObject({ leads: 5, costPerLead: 16 })
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('COUNT(DISTINCT id) as campaign_count')
    expect(String(mockQueryRows.mock.calls[1]?.[0])).toContain('COUNT(DISTINCT cam.id) as campaign_count')
    const leadSql = String(mockQueryRows.mock.calls[3]?.[0])
    expect(leadSql).toContain('FROM leads l')
    expect(leadSql).not.toContain('destination_type = \'portal\'')
  })

  it('supports agency lead trends', async () => {
    mockQueryRows
      .mockResolvedValueOnce([{ date: '2026-05-01', platform: 'meta', spend: '60', impressions: '100', clicks: '10', conversions: '1', revenue: '0' }])
      .mockResolvedValueOnce([{ date: '2026-05-01', platform: 'meta', leads: '6' }])

    const result = await trendsHandler({
      query: {
        startDate: '2026-05-01',
        endDate: '2026-05-27',
        metric: 'costPerLead',
        groupBy: 'day'
      }
    })

    expect(result).toMatchObject({
      metric: 'costPerLead',
      dataPoints: [{ date: '2026-05-01', value: 10, byPlatform: { meta: 10 } }]
    })
  })

  it('exports agency lead metrics in analytics CSV', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        campaign_name: 'Search Leads',
        platform: 'google_ads',
        campaign_id: 'camp-1',
        client_id: 'client-1',
        client_name: 'Client One',
        spend: '200',
        budget: '500',
        impressions: '1000',
        clicks: '100',
        conversions: '5',
        revenue: '0',
        media_spend_id: 'ms-1',
        lead_count: '8',
        lead_new_count: '3',
        lead_contacted_count: '2',
        lead_qualified_count: '1',
        lead_won_count: '1',
        lead_lost_count: '1'
      }
    ])

    const csv = await exportHandler({
      query: { startDate: '2026-05-01', endDate: '2026-05-27' }
    })

    expect(csv).toContain('Leads,New Leads,Contacted Leads,Qualified Leads,Won Leads,Lost Leads,Cost Per Lead')
    expect(csv).toContain('Google Ads,Search Leads,Client One,200.00,500.00,1000,100,8,3,2,1,1,1,25.00,5')
    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('FROM leads l')
    expect(sql).not.toContain('destination_type = \'portal\'')
  })
})
