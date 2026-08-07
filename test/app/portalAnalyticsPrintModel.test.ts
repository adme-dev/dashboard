import { describe, expect, it } from 'vitest'
import type {
  PortalAnalyticsCampaignsResponse,
  PortalAnalyticsOverview,
  PortalAnalyticsPrintFilters,
  PortalAnalyticsTrendResponse
} from '../../app/types'
import { buildPortalAnalyticsPrintReport } from '../../app/composables/usePortalAnalyticsPrintReport'

const filters: PortalAnalyticsPrintFilters = {
  startDate: '2026-07-08',
  endDate: '2026-08-07',
  platforms: ['google_ads'],
  runningOnly: true,
  metric: 'leads'
}

const overview: PortalAnalyticsOverview = {
  totals: { spend: 208, impressions: 19_800, clicks: 415, conversions: 9, revenue: 0, cpc: 0.5, cpm: 10.51, ctr: 2.1, roas: 0, leads: 1 },
  previousPeriod: { spend: 200, impressions: 18_000, clicks: 380, conversions: 8, revenue: 0, cpc: 0.53, cpm: 11.11, ctr: 2.11, roas: 0, leads: 0 },
  byPlatform: []
}
const trend: PortalAnalyticsTrendResponse = {
  dataPoints: [{ date: '2026-08-07', value: 1, byPlatform: { google_ads: 1 } }],
  resolution: 'day'
}
const campaigns: PortalAnalyticsCampaignsResponse = {
  campaigns: [],
  total: 0
}

const fulfilled = <T>(value: T): PromiseFulfilledResult<T> => ({ status: 'fulfilled', value })
const rejected = (reason = new Error('unavailable')): PromiseRejectedResult => ({ status: 'rejected', reason })

describe('portal analytics print report model', () => {
  it('retains required advertising data', () => {
    const report = buildPortalAnalyticsPrintReport(
      filters,
      { overview, trend, campaigns },
      { freshness: fulfilled({ generatedAt: '2026-08-07T04:30:00.000Z', sources: [] }) }
    )

    expect(report.filters).toEqual(filters)
    expect(report.overview).toBe(overview)
    expect(report.trend).toBe(trend)
    expect(report.campaigns).toBe(campaigns)
    expect(report.sections.freshness).toEqual({ status: 'available', data: { generatedAt: '2026-08-07T04:30:00.000Z', sources: [] } })
  })

  it('marks rejected optional sources unavailable without exposing their errors', () => {
    const report = buildPortalAnalyticsPrintReport(
      filters,
      { overview, trend, campaigns },
      {
        websiteFunnel: rejected(new Error('database credentials')),
        personas: rejected(new Error('internal endpoint failed'))
      }
    )

    expect(report.sections.websiteFunnel).toEqual({ status: 'unavailable', data: null })
    expect(report.sections.personas).toEqual({ status: 'unavailable', data: null })
    expect(JSON.stringify(report)).not.toContain('database credentials')
    expect(JSON.stringify(report)).not.toContain('internal endpoint failed')
  })

  it('keeps fulfilled empty optional responses available', () => {
    const report = buildPortalAnalyticsPrintReport(
      filters,
      { overview, trend, campaigns },
      {
        trackingSummary: fulfilled({ visitors: 0, sessions: 0, pageViews: 0, events: 0, avgEngagementSeconds: 0, sessionsScrolled75: 0, callClicks: 0, formSubmits: 0, generateLeads: 0, testDriveBookings: 0, interactionLeads: 0, vehicleViews: 0 }),
        trackingSources: fulfilled({ rows: [] })
      }
    )

    expect(report.sections.trackingSummary.status).toBe('available')
    expect(report.sections.trackingSources).toEqual({ status: 'available', data: { rows: [] } })
  })
})
