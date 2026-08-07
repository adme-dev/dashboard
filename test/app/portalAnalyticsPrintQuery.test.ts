import { describe, expect, it } from 'vitest'
import {
  buildPortalAnalyticsPrintUrl,
  normalizePortalAnalyticsPrintFilters
} from '../../app/utils/portalAnalyticsPrint'

const now = new Date(2026, 7, 7, 14, 30)

describe('portal analytics print filters', () => {
  it('preserves valid report filters and removes duplicate platforms', () => {
    expect(normalizePortalAnalyticsPrintFilters({
      startDate: '2026-07-08',
      endDate: '2026-08-07',
      platform: 'google_ads,meta,google_ads',
      runningOnly: 'true',
      metric: 'leads'
    }, now)).toEqual({
      startDate: '2026-07-08',
      endDate: '2026-08-07',
      platforms: ['google_ads', 'meta'],
      runningOnly: true,
      metric: 'leads'
    })
  })

  it('uses stable defaults for missing or malformed filters', () => {
    expect(normalizePortalAnalyticsPrintFilters({
      startDate: 'not-a-date',
      endDate: ['also-invalid'],
      platform: ['meta,google_ads'],
      runningOnly: '0',
      metric: 'revenue'
    }, now)).toEqual({
      startDate: '2026-07-08',
      endDate: '2026-08-07',
      platforms: ['meta', 'google_ads'],
      runningOnly: false,
      metric: 'spend'
    })
  })

  it('builds a deterministic print route URL', () => {
    const filters = normalizePortalAnalyticsPrintFilters({
      startDate: '2026-07-08',
      endDate: '2026-08-07',
      platform: 'meta,google_ads',
      runningOnly: '1',
      metric: 'costPerLead'
    }, now)

    expect(buildPortalAnalyticsPrintUrl(filters)).toBe(
      '/portal/analytics/print?startDate=2026-07-08&endDate=2026-08-07&platform=meta%2Cgoogle_ads&runningOnly=true&metric=costPerLead'
    )
  })
})
