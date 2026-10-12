import { describe, expect, it } from 'vitest'
import { formatSocialMetric, formatSocialRate } from '~/utils/socialReportingFormat'

describe('social metric display', () => {
  it('distinguishes missing measurements from measured zeroes', () => {
    expect(formatSocialMetric(null)).toBe('—')
    expect(formatSocialMetric(undefined)).toBe('—')
    expect(formatSocialMetric(0)).toBe('0')
    expect(formatSocialRate(null)).toBe('—')
    expect(formatSocialRate(0)).toBe('0%')
    expect(formatSocialRate(2.5)).toBe('2.5%')
    expect(formatSocialMetric(1500)).toBe('1.5k')
  })
})
