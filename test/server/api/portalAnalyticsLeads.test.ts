import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  query?: Record<string, string>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getQuery: (event: TestEvent) => Record<string, string>
  setResponseHeader: (event: TestEvent, name: string, value: string) => void
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getQuery = event => event.query ?? {}
testGlobal.setResponseHeader = vi.fn()
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireClientAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('~~/server/utils/clientAuth', () => ({
  requireClientAuth: (...args: unknown[]) => mockRequireClientAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

const { default: campaignsHandler } = await import(
  '../../../../server/api/portal/analytics/campaigns.get'
)
const { default: overviewHandler } = await import(
  '../../../../server/api/portal/analytics/overview.get'
)
const { default: trendsHandler } = await import(
  '../../../../server/api/portal/analytics/trends.get'
)
const { default: exportHandler } = await import(
  '../../../../server/api/portal/analytics/export.get'
)

const authUser = {
  clientId: 'client-1',
  permissions: { canViewAnalytics: true }
}

describe('portal analytics lead metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireClientAuth.mockResolvedValue(authUser)
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({ count: '0' })
  })

  it('adds portal-visible lead metrics to campaign rows', async () => {
    mockQueryOne.mockResolvedValueOnce({ count: '1' })
    mockQueryRows.mockResolvedValueOnce([
      {
        campaign_id: 'camp-1',
        campaign_name: 'Search Leads',
        platform: 'google_ads',
        campaign_type: 'SEARCH',
        campaign_status: 'ENABLED',
        spend: '250',
        impressions: '1000',
        clicks: '100',
        conversions: '5',
        revenue: '0',
        media_spend_id: 'ms-1',
        lead_count: '10',
        lead_new_count: '4',
        lead_contacted_count: '3',
        lead_qualified_count: '2',
        lead_won_count: '1',
        lead_lost_count: '0',
        cost_per_lead: '25'
      }
    ])

    const result = await campaignsHandler({
      query: {
        startDate: '2026-05-01',
        endDate: '2026-05-27',
        sortBy: 'lead_count'
      }
    })

    expect(result.campaigns[0]).toMatchObject({
      campaignId: 'camp-1',
      leadCount: 10,
      leadNewCount: 4,
      leadContactedCount: 3,
      leadQualifiedCount: 2,
      leadWonCount: 1,
      costPerLead: 25
    })
    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('FROM leads l')
    expect(sql).toContain('d.destination_type = \'portal\'')
    expect(sql).toContain('l.source = CASE')
    expect(sql).toContain('ORDER BY lead_count DESC')
  })

  it('adds portal-visible lead totals to analytics overview', async () => {
    mockQueryRows
      .mockResolvedValueOnce([
        {
          platform: 'meta',
          spend: '100',
          impressions: '1000',
          clicks: '50',
          conversions: '2',
          revenue: '0',
          campaign_count: '1'
        }
      ])
      .mockResolvedValueOnce([
        {
          spend: '80',
          impressions: '800',
          clicks: '40',
          conversions: '1',
          revenue: '0'
        }
      ])
      .mockResolvedValueOnce([
        {
          lead_count: '8',
          lead_new_count: '3',
          lead_contacted_count: '2',
          lead_qualified_count: '1',
          lead_won_count: '1',
          lead_lost_count: '1',
          avg_response_minutes: '45'
        }
      ])
      .mockResolvedValueOnce([
        {
          lead_count: '4',
          lead_new_count: '2',
          lead_contacted_count: '1',
          lead_qualified_count: '0',
          lead_won_count: '1',
          lead_lost_count: '0'
        }
      ])

    const result = await overviewHandler({
      query: { startDate: '2026-05-01', endDate: '2026-05-27' }
    })

    expect(result.totals).toMatchObject({
      spend: 100,
      leads: 8,
      leadNew: 3,
      leadContacted: 2,
      leadWon: 1,
      costPerLead: 12.5,
      avgResponseMinutes: 45
    })
    expect(result.previousPeriod).toMatchObject({
      leads: 4,
      costPerLead: 20
    })
    const leadSql = String(mockQueryRows.mock.calls[2]?.[0])
    expect(leadSql).toContain('FROM leads l')
    expect(leadSql).toContain('d.destination_type = \'portal\'')
  })

  it('supports lead trend metric from portal-visible leads', async () => {
    mockQueryRows
      .mockResolvedValueOnce([
        {
          date: '2026-05-01',
          platform: 'google_ads',
          spend: '50',
          impressions: '100',
          clicks: '10',
          conversions: '1',
          revenue: '0'
        }
      ])
      .mockResolvedValueOnce([
        {
          date: '2026-05-01',
          platform: 'google_ads',
          leads: '6'
        }
      ])

    const result = await trendsHandler({
      query: {
        startDate: '2026-05-01',
        endDate: '2026-05-27',
        metric: 'leads',
        groupBy: 'day'
      }
    })

    expect(result).toMatchObject({
      metric: 'leads',
      dataPoints: [
        {
          date: '2026-05-01',
          value: 6,
          byPlatform: { google_ads: 6 }
        }
      ]
    })
    const leadSql = String(mockQueryRows.mock.calls[1]?.[0])
    expect(leadSql).toContain('COUNT(*)::int as leads')
    expect(leadSql).toContain('d.destination_type = \'portal\'')
  })

  it('exports portal campaign analytics with lead metrics', async () => {
    mockQueryRows.mockResolvedValueOnce([
      {
        campaign_name: 'Client Search',
        platform: 'google_ads',
        campaign_id: 'camp-1',
        spend: '300',
        impressions: '1200',
        clicks: '120',
        conversions: '4',
        revenue: '0',
        lead_count: '12',
        lead_new_count: '5',
        lead_contacted_count: '4',
        lead_qualified_count: '2',
        lead_won_count: '1',
        lead_lost_count: '0'
      }
    ])

    const csv = await exportHandler({
      query: { startDate: '2026-05-01', endDate: '2026-05-27' }
    })

    expect(csv).toContain('Platform,Campaign,Spend,Impressions,Clicks,Leads,New Leads')
    expect(csv).toContain('Google Ads,Client Search,300.00,1200,120,12,5,4,2,1,0,25.00')
    const sql = String(mockQueryRows.mock.calls[0]?.[0])
    expect(sql).toContain('FROM leads l')
    expect(sql).toContain('d.destination_type = \'portal\'')
    expect(sql).toContain('l.client_id = $3')
  })
})
