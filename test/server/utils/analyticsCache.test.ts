import { describe, it, expect } from 'vitest'
import { isProvisionalWindow, analyticsCacheKey } from '~~/server/utils/analyticsCache'

describe('isProvisionalWindow', () => {
  it('is provisional when the window end is within the trailing 48h', () => {
    expect(isProvisionalWindow('2026-05-31', '2026-05-31')).toBe(true)
    expect(isProvisionalWindow('2026-05-30', '2026-05-31')).toBe(true) // 1 day back
    expect(isProvisionalWindow('2026-05-29', '2026-05-31')).toBe(true) // exactly 2 days back
  })
  it('is final when the window end is older than the trailing window', () => {
    expect(isProvisionalWindow('2026-05-28', '2026-05-31')).toBe(false)
    expect(isProvisionalWindow('2026-04-30', '2026-05-31')).toBe(false)
  })
  it('respects a custom trailingDays', () => {
    expect(isProvisionalWindow('2026-05-25', '2026-05-31', 7)).toBe(true)
    expect(isProvisionalWindow('2026-05-23', '2026-05-31', 7)).toBe(false)
  })
})

describe('analyticsCacheKey', () => {
  it('builds a stable key, defaulting client/platforms to "all"', () => {
    expect(analyticsCacheKey('blended', { startDate: '2026-05-01', endDate: '2026-05-31' }))
      .toBe('analytics:blended:all:2026-05-01:2026-05-31:all')
  })
  it('includes client + platforms when present', () => {
    expect(analyticsCacheKey('overview', { clientId: 'c1', startDate: '2026-05-01', endDate: '2026-05-31', platforms: 'meta,google_ads' }))
      .toBe('analytics:overview:c1:2026-05-01:2026-05-31:meta,google_ads')
  })
})
