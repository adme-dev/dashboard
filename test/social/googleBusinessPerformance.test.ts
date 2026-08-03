import { describe, expect, it, vi } from 'vitest'
import {
  GOOGLE_BUSINESS_DAILY_METRICS,
  fetchGoogleBusinessDailyMetrics,
  normalizeGoogleBusinessDailyMetrics,
  syncGoogleBusinessPerformance
} from '~~/server/utils/social-providers/google-business-performance'

describe('Google Business Profile performance evidence', () => {
  it('normalizes only documented metrics and does not invent missing dates', () => {
    const rows = normalizeGoogleBusinessDailyMetrics({
      multiDailyMetricTimeSeries: [{
        dailyMetricTimeSeries: [
          {
            dailyMetric: 'WEBSITE_CLICKS',
            timeSeries: {
              datedValues: [
                { date: { year: 2026, month: 8, day: 1 }, value: '7' },
                { date: { year: 2026, month: 8, day: 2 } }
              ]
            }
          },
          {
            dailyMetric: 'UNSUPPORTED_METRIC',
            timeSeries: {
              datedValues: [{ date: { year: 2026, month: 8, day: 1 }, value: '99' }]
            }
          }
        ]
      }]
    })

    expect(rows).toEqual([
      { metricName: 'WEBSITE_CLICKS', metricDate: '2026-08-01', value: 7 },
      { metricName: 'WEBSITE_CLICKS', metricDate: '2026-08-02', value: 0 }
    ])
    expect(rows).not.toContainEqual(expect.objectContaining({ metricDate: '2026-08-03' }))
  })

  it('calls the fixed Performance API with the documented inclusive range', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      multiDailyMetricTimeSeries: []
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await fetchGoogleBusinessDailyMetrics({
      locationId: '987654321',
      accessToken: 'SECRET_TOKEN',
      startDate: '2026-07-01',
      endDate: '2026-08-01',
      fetchImpl,
      now: () => new Date('2026-08-03T01:02:03.000Z')
    })

    expect(result).toEqual({ rows: [], fetchedAt: '2026-08-03T01:02:03.000Z' })
    const [request, init] = fetchImpl.mock.calls[0]!
    const url = new URL(String(request))
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://businessprofileperformance.googleapis.com/v1/locations/987654321:fetchMultiDailyMetricsTimeSeries'
    )
    expect(url.searchParams.getAll('dailyMetrics')).toEqual(GOOGLE_BUSINESS_DAILY_METRICS)
    expect(url.searchParams.get('dailyRange.start_date.year')).toBe('2026')
    expect(url.searchParams.get('dailyRange.end_date.day')).toBe('1')
    expect(init).toMatchObject({
      method: 'GET',
      headers: { Authorization: 'Bearer SECRET_TOKEN' }
    })
  })

  it('rejects unsafe location identifiers and returns a redacted provider failure', async () => {
    await expect(fetchGoogleBusinessDailyMetrics({
      locationId: '../accounts/private',
      accessToken: 'SECRET_TOKEN',
      startDate: '2026-07-01',
      endDate: '2026-08-01'
    })).rejects.toThrow('Google Business location ID is invalid')

    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'token SECRET_TOKEN rejected with private provider body' }
    }), { status: 403 }))
    await expect(fetchGoogleBusinessDailyMetrics({
      locationId: '987654321',
      accessToken: 'SECRET_TOKEN',
      startDate: '2026-07-01',
      endDate: '2026-08-01',
      fetchImpl
    })).rejects.toThrow('Google Business Performance API request failed (403)')
  })

  it('refreshes and persists only tenant-scoped normalized rows in one bounded batch', async () => {
    const executeSql = vi.fn(async () => 1)
    const resolveAccessToken = vi.fn(async () => 'FRESH_TOKEN')
    const fetchMetrics = vi.fn(async () => ({
      fetchedAt: '2026-08-03T01:02:03.000Z',
      rows: [{ metricName: 'WEBSITE_CLICKS' as const, metricDate: '2026-08-01', value: 7 }]
    }))

    const result = await syncGoogleBusinessPerformance({
      now: () => new Date('2026-08-03T01:02:03.000Z'),
      queryAccounts: async () => [{
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        client_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        platform_account_id: 'account:987654321',
        access_token: 'OLD_TOKEN',
        refresh_token: 'REFRESH_TOKEN',
        token_expires_at: '2026-01-01T00:00:00.000Z',
        metadata: { googleBusinessLocationId: '987654321' }
      }],
      executeSql,
      resolveAccessToken: resolveAccessToken as never,
      fetchMetrics
    })

    expect(result).toEqual({
      eligibleAccounts: 1,
      syncedAccounts: 1,
      failedAccounts: 0,
      rowsUpserted: 1
    })
    expect(fetchMetrics).toHaveBeenCalledWith(expect.objectContaining({
      locationId: '987654321',
      accessToken: 'FRESH_TOKEN',
      startDate: '2026-05-05',
      endDate: '2026-08-02'
    }))
    const metricWrite = executeSql.mock.calls.find(([sql]) => String(sql).includes('search_authority_google_business_metrics'))
    expect(metricWrite?.[1]).toEqual(expect.arrayContaining([
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '987654321'
    ]))
    expect(JSON.stringify(executeSql.mock.calls)).not.toContain('FRESH_TOKEN')
    expect(JSON.stringify(executeSql.mock.calls)).not.toContain('REFRESH_TOKEN')
  })
})
