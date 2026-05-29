import { describe, it, expect } from 'vitest'
import { toDateOnly } from '~~/server/utils/analyticsMetrics'

describe('toDateOnly', () => {
  it('formats a JS Date (local midnight) to YYYY-MM-DD without timezone drift', () => {
    // Regression: String(date).slice(0,10) used to yield "Sun May 31" → reparsed as year 2001.
    expect(toDateOnly(new Date(2026, 4, 31))).toBe('2026-05-31') // month is 0-indexed → May
    expect(toDateOnly(new Date(2026, 0, 1))).toBe('2026-01-01')
  })
  it('passes through a YYYY-MM-DD string', () => {
    expect(toDateOnly('2026-05-31')).toBe('2026-05-31')
  })
  it('truncates an ISO timestamp string to the date', () => {
    expect(toDateOnly('2026-05-31T00:00:00.000Z')).toBe('2026-05-31')
  })
  it('returns null for empty, invalid, or non-date values', () => {
    expect(toDateOnly(null)).toBeNull()
    expect(toDateOnly(undefined)).toBeNull()
    expect(toDateOnly('')).toBeNull()
    expect(toDateOnly('not a date')).toBeNull()
    expect(toDateOnly(new Date('invalid'))).toBeNull()
  })
})
