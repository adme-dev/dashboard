// test/utils/ga4Client.test.ts
import { describe, it, expect } from 'vitest'
import { parseGa4Report, GA4_METRICS } from '~~/server/utils/ga4Client'

describe('parseGa4Report', () => {
  it('parses dimension+metric rows into typed objects with ISO dates', () => {
    const resp = {
      rows: [
        {
          dimensionValues: [{ value: '20260515' }, { value: 'Paid Search' }],
          metricValues: [
            { value: '120' }, { value: '100' }, { value: '40' }, { value: '90' },
            { value: '0.75' }, { value: '63.5' }, { value: '8' }, { value: '0' }
          ]
        }
      ]
    }
    const rows = parseGa4Report(resp as any)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      date: '2026-05-15',
      channelGroup: 'Paid Search',
      sessions: 120,
      totalUsers: 100,
      newUsers: 40,
      engagedSessions: 90,
      engagementRate: 0.75,
      avgSessionDuration: 63.5,
      keyEvents: 8,
      purchaseRevenue: 0
    })
  })

  it('returns [] when the API omits rows', () => {
    expect(parseGa4Report({} as any)).toEqual([])
  })

  it('defaults a missing channel to (not set) and coerces missing metrics to 0', () => {
    const resp = { rows: [{ dimensionValues: [{ value: '20260101' }], metricValues: [] }] }
    const rows = parseGa4Report(resp as any)
    expect(rows[0].channelGroup).toBe('(not set)')
    expect(rows[0].sessions).toBe(0)
  })

  it('keeps GA4_METRICS request order aligned with the parser (8 metrics)', () => {
    expect(GA4_METRICS).toHaveLength(8)
    expect(GA4_METRICS[0]).toBe('sessions')
    expect(GA4_METRICS[7]).toBe('purchaseRevenue')
  })
})
