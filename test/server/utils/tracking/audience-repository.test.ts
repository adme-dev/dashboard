import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudienceRange } from '../../../../app/types/audience-analytics'

const mockQueryRows = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const {
  getAudienceBreakdowns,
  getAudienceOverview,
  getAudienceTimeseries,
  withAudienceQueryTiming
} = await import(
  '../../../../server/utils/tracking/audience-repository'
)

const CLIENT_A = '11111111-1111-4111-8111-111111111111'
const CLIENT_B = '22222222-2222-4222-8222-222222222222'
const SITE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const range: AudienceRange = {
  fromDate: '2026-07-03',
  toDate: '2026-08-01',
  previousFromDate: '2026-06-03',
  previousToDate: '2026-07-02',
  days: 30
}

function rowSet(sql: string) {
  if (sql.includes('audience:available-clients')) {
    return [
      { id: CLIENT_A, name: 'Alpha Motors' },
      { id: CLIENT_B, name: 'Bravo Motors' }
    ]
  }
  if (sql.includes('audience:sites')) {
    return [{
      id: SITE_A,
      client_id: CLIENT_A,
      client_name: 'Alpha Motors',
      name: 'Alpha website',
      origin: 'https://alpha.example',
      is_active: true,
      last_event_at: '2026-08-01T10:00:00.000Z',
      events_in_window: '250'
    }]
  }
  if (sql.includes('audience:kpis')) {
    return [
      {
        period: 'current',
        visitors: '100',
        sessions: '120',
        page_views: '250',
        engaged_sessions: '72',
        repeat_visitors: '20',
        lead_actions: '12',
        confirmed_leads: '8',
        attributed_leads: '6'
      },
      {
        period: 'previous',
        visitors: '80',
        sessions: '100',
        page_views: '200',
        engaged_sessions: '50',
        repeat_visitors: '15',
        lead_actions: '10',
        confirmed_leads: '10',
        attributed_leads: '5'
      }
    ]
  }
  if (sql.includes('audience:opportunities')) {
    return [{
      sessions: '100',
      high_intent_non_converters: '14',
      repeat_non_converters: '9',
      multi_interest_visitors: '7',
      paid_sessions: '40',
      paid_engagement_rate: '30',
      baseline_engagement_rate: '52',
      organic_sessions: '30',
      organic_engagement_rate: '68',
      organic_baseline_engagement_rate: '50',
      strong_organic_pages: '2',
      lead_actions: '10',
      previous_lead_actions: '5',
      confirmed_leads: '2',
      previous_confirmed_leads: '4',
      divergent_clients: '1'
    }]
  }
  if (sql.includes('audience:clients')) {
    return [{
      client_id: CLIENT_A,
      client_name: 'Alpha Motors',
      site_count: '1',
      active_site_count: '1',
      last_event_at: '2026-08-01T10:00:00.000Z',
      visitors: '100',
      previous_visitors: '80',
      sessions: '120',
      engaged_sessions: '72',
      lead_actions: '12',
      confirmed_leads: '8',
      attributed_leads: '6'
    }]
  }
  if (sql.includes('audience:timeseries')) {
    return [
      {
        period: 'current',
        day: '2026-07-30',
        visitors: '4',
        sessions: '5',
        engaged_sessions: '3',
        lead_actions: '1',
        confirmed_leads: '1'
      },
      {
        period: 'current',
        day: '2026-08-01',
        visitors: '8',
        sessions: '10',
        engaged_sessions: '7',
        lead_actions: '2',
        confirmed_leads: '1'
      },
      {
        period: 'previous',
        day: '2026-07-27',
        visitors: '3',
        sessions: '4',
        engaged_sessions: '2',
        lead_actions: '0',
        confirmed_leads: '0'
      }
    ]
  }
  if (sql.includes('audience:breakdown')) {
    return [{
      key: 'google',
      visitors: '40',
      sessions: '50',
      engaged_sessions: '31',
      lead_actions: '8',
      confirmed_leads: '5'
    }]
  }
  throw new Error(`Unexpected audience query: ${sql.slice(0, 80)}`)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'))
  mockQueryRows.mockReset().mockImplementation((sql: string) => Promise.resolve(rowSet(sql)))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('getAudienceOverview', () => {
  it('returns a fail-closed zero contract without touching the database for empty scope', async () => {
    await expect(getAudienceOverview({
      range,
      clientIds: [],
      accessibleClientIds: []
    })).resolves.toEqual({
      generatedAt: '2026-08-01T12:00:00.000Z',
      window: range,
      coverage: {
        total: 0,
        receiving: 0,
        stale: 0,
        noRecentData: 0,
        neverReceived: 0,
        inactive: 0,
        sites: []
      },
      kpis: {
        visitors: 0,
        sessions: 0,
        pageViews: 0,
        engagedSessions: 0,
        engagementRate: 0,
        repeatVisitors: 0,
        leadActions: 0,
        confirmedLeads: 0,
        visitorToLeadRate: 0,
        attributionCoverage: 0
      },
      previousKpis: {
        visitors: 0,
        sessions: 0,
        pageViews: 0,
        engagedSessions: 0,
        engagementRate: 0,
        repeatVisitors: 0,
        leadActions: 0,
        confirmedLeads: 0,
        visitorToLeadRate: 0,
        attributionCoverage: 0
      },
      opportunities: [],
      clients: [],
      availableClients: []
    })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('maps Postgres aggregates into scoped coverage, KPI, opportunity, and client contracts', async () => {
    const result = await getAudienceOverview({
      range,
      clientIds: [CLIENT_A],
      accessibleClientIds: [CLIENT_A, CLIENT_B]
    })

    expect(result.availableClients).toEqual([
      { id: CLIENT_A, name: 'Alpha Motors' },
      { id: CLIENT_B, name: 'Bravo Motors' }
    ])
    expect(result.coverage).toEqual({
      total: 1,
      receiving: 1,
      stale: 0,
      noRecentData: 0,
      neverReceived: 0,
      inactive: 0,
      sites: [{
        id: SITE_A,
        clientId: CLIENT_A,
        clientName: 'Alpha Motors',
        name: 'Alpha website',
        origin: 'https://alpha.example',
        isActive: true,
        status: 'receiving',
        lastEventAt: '2026-08-01T10:00:00.000Z',
        eventsInWindow: 250
      }]
    })
    expect(result.kpis).toEqual({
      visitors: 100,
      sessions: 120,
      pageViews: 250,
      engagedSessions: 72,
      engagementRate: 60,
      repeatVisitors: 20,
      leadActions: 12,
      confirmedLeads: 8,
      visitorToLeadRate: 8,
      attributionCoverage: 75
    })
    expect(result.previousKpis).toMatchObject({
      visitors: 80,
      sessions: 100,
      engagementRate: 50,
      confirmedLeads: 10,
      visitorToLeadRate: 12.5,
      attributionCoverage: 50
    })
    expect(result.opportunities).toHaveLength(6)
    expect(result.opportunities.every(item => item.status === 'opportunity')).toBe(true)
    expect(result.clients).toEqual([{
      clientId: CLIENT_A,
      clientName: 'Alpha Motors',
      siteCount: 1,
      status: 'receiving',
      visitors: 100,
      engagementRate: 60,
      leadActions: 12,
      confirmedLeads: 8,
      visitorToLeadRate: 8,
      attributionCoverage: 75,
      visitorsDeltaPercent: 25,
      lastEventAt: '2026-08-01T10:00:00.000Z'
    }])

    const calls = mockQueryRows.mock.calls.map(([sql, params]) => ({ sql: String(sql), params }))
    expect(calls.find(call => call.sql.includes('audience:available-clients'))?.params).toEqual([
      [CLIENT_A, CLIENT_B]
    ])
    expect(calls.filter(call => !call.sql.includes('audience:available-clients'))
      .every(call => JSON.stringify(call.params).includes(CLIENT_A))).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/anon_id|session_id|gclid|fingerprint|email|phone/i)
  })

  it('keeps management null scope parameterised instead of interpolating client filters', async () => {
    await getAudienceOverview({ range, clientIds: null, accessibleClientIds: null })

    expect(mockQueryRows.mock.calls).toHaveLength(5)
    for (const [sql, params] of mockQueryRows.mock.calls) {
      expect(String(sql)).toContain('::uuid[] IS NULL')
      expect(params[0]).toBeNull()
    }
  })
})

describe('withAudienceQueryTiming', () => {
  it('logs only an allowlisted operation and duration when a query exceeds 1.5 seconds', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const now = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_601)

    await expect(withAudienceQueryTiming('overview', async () => 'ok')).resolves.toBe('ok')

    expect(now).toHaveBeenCalledTimes(2)
    expect(warning).toHaveBeenCalledWith('[audiences] slow query', {
      operation: 'overview',
      durationMs: 1601
    })
    expect(JSON.stringify(warning.mock.calls)).not.toMatch(new RegExp(CLIENT_A, 'i'))
  })
})

describe('getAudienceTimeseries', () => {
  it('returns equal zero-filled current and previous series with stable day indexes', async () => {
    const shortRange: AudienceRange = {
      fromDate: '2026-07-30',
      toDate: '2026-08-01',
      previousFromDate: '2026-07-27',
      previousToDate: '2026-07-29',
      days: 3
    }

    const result = await getAudienceTimeseries({
      range: shortRange,
      clientIds: [CLIENT_A],
      metric: 'visitors'
    })

    expect(result).toEqual({
      generatedAt: '2026-08-01T12:00:00.000Z',
      window: shortRange,
      metric: 'visitors',
      current: [
        { day: '2026-07-30', dayIndex: 0, visitors: 4, sessions: 5, engagedSessions: 3, leadActions: 1, confirmedLeads: 1 },
        { day: '2026-07-31', dayIndex: 1, visitors: 0, sessions: 0, engagedSessions: 0, leadActions: 0, confirmedLeads: 0 },
        { day: '2026-08-01', dayIndex: 2, visitors: 8, sessions: 10, engagedSessions: 7, leadActions: 2, confirmedLeads: 1 }
      ],
      previous: [
        { day: '2026-07-27', dayIndex: 0, visitors: 3, sessions: 4, engagedSessions: 2, leadActions: 0, confirmedLeads: 0 },
        { day: '2026-07-28', dayIndex: 1, visitors: 0, sessions: 0, engagedSessions: 0, leadActions: 0, confirmedLeads: 0 },
        { day: '2026-07-29', dayIndex: 2, visitors: 0, sessions: 0, engagedSessions: 0, leadActions: 0, confirmedLeads: 0 }
      ]
    })
  })

  it('returns an empty-scope contract without querying', async () => {
    const result = await getAudienceTimeseries({ range, clientIds: [], metric: 'sessions' })

    expect(result.current).toHaveLength(30)
    expect(result.previous).toHaveLength(30)
    expect(result.current.every(point => point.sessions === 0)).toBe(true)
    expect(mockQueryRows).not.toHaveBeenCalled()
  })
})

describe('getAudienceBreakdowns', () => {
  it('maps a fixed dimension into quality metrics without exposing source identifiers', async () => {
    const result = await getAudienceBreakdowns({
      range,
      clientIds: [CLIENT_A],
      dimension: 'source'
    })

    expect(result).toEqual({
      generatedAt: '2026-08-01T12:00:00.000Z',
      window: range,
      dimension: 'source',
      rows: [{
        key: 'google',
        visitors: 40,
        sessions: 50,
        engagementRate: 62,
        leadActions: 8,
        confirmedLeads: 5,
        confirmedLeadRate: 10
      }]
    })
    expect(JSON.stringify(result)).not.toMatch(/anon_id|session_id|gclid|fingerprint/i)
  })
})
