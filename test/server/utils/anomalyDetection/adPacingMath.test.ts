import { describe, it, expect } from 'vitest'
import {
  periodOf, dayOfMonth, daysInMonth, expectedToDate, projectedMonthEnd,
} from '~~/server/utils/anomalyDetection/adPacingMath'

describe('adPacingMath', () => {
  const apr15 = new Date('2026-04-15T00:00:00Z')

  it('formats the YYYY-MM period from a date', () => {
    expect(periodOf(apr15)).toBe('2026-04')
    expect(periodOf(new Date('2026-12-03T00:00:00Z'))).toBe('2026-12')
  })

  it('computes day-of-month and days-in-month', () => {
    expect(dayOfMonth(apr15)).toBe(15)
    expect(daysInMonth(apr15)).toBe(30)
    expect(daysInMonth(new Date('2026-02-10T00:00:00Z'))).toBe(28)
  })

  it('computes expected-to-date as budget × day/daysInMonth', () => {
    expect(expectedToDate(3000, apr15)).toBeCloseTo(1500, 5)
  })

  it('projects month-end from MTD spend', () => {
    expect(projectedMonthEnd(750, apr15)).toBeCloseTo(1500, 5)
  })
})
