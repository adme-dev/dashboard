import { describe, it, expect } from 'vitest'
import { dailySpendWindow } from '~~/server/utils/analyticsMetrics'
import { previousWindow } from '~~/server/utils/ga4Funnel'

describe('dailySpendWindow', () => {
  it('emits an inclusive BETWEEN fragment on the daily_spend grain at the given param indices', () => {
    expect(dailySpendWindow(1, 2)).toBe('ds.spend_date BETWEEN $1 AND $2')
    expect(dailySpendWindow(4, 5)).toBe('ds.spend_date BETWEEN $4 AND $5')
  })
})

describe('daily-grain previous window', () => {
  it('a 7-day window maps to the immediately-preceding 7 days (not whole months)', () => {
    // The bug being fixed: slice(0,7) turned both ends into the same YYYY-MM
    // month bucket. The day-accurate path uses previousWindow over ISO dates.
    expect(previousWindow('2026-05-08', '2026-05-14')).toEqual({
      prevStart: '2026-05-01',
      prevEnd: '2026-05-07'
    })
  })

  it('a window crossing a month boundary stays day-accurate', () => {
    expect(previousWindow('2026-05-01', '2026-05-07')).toEqual({
      prevStart: '2026-04-24',
      prevEnd: '2026-04-30'
    })
  })
})
