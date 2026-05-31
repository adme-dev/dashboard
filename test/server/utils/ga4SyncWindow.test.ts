import { describe, it, expect } from 'vitest'
import { ga4SyncWindow, GA4_TRAILING_RESYNC_DAYS } from '~~/server/utils/ga4Sync'

describe('ga4SyncWindow', () => {
  it('uses an explicit start/end range verbatim (backfill)', () => {
    expect(ga4SyncWindow({ startDate: '2026-01-01', endDate: '2026-03-31', today: '2026-05-31' }))
      .toEqual({ startDate: '2026-01-01', endDate: '2026-03-31' })
  })

  it('reaches back lookbackDays from today when no explicit range', () => {
    expect(ga4SyncWindow({ lookbackDays: 14, today: '2026-05-31' }))
      .toEqual({ startDate: '2026-05-17', endDate: '2026-05-31' })
  })

  it('floors the window at the trailing-resync minimum so every run overwrites ~48h', () => {
    expect(GA4_TRAILING_RESYNC_DAYS).toBe(2)
    // lookbackDays:0 would otherwise be a zero-width window; floored to 2 days
    expect(ga4SyncWindow({ lookbackDays: 0, today: '2026-05-31' }))
      .toEqual({ startDate: '2026-05-29', endDate: '2026-05-31' })
  })

  it('crosses month boundaries correctly', () => {
    expect(ga4SyncWindow({ lookbackDays: 5, today: '2026-03-02' }))
      .toEqual({ startDate: '2026-02-25', endDate: '2026-03-02' })
  })

  it('defaults lookback to 14 days', () => {
    expect(ga4SyncWindow({ today: '2026-05-31' }))
      .toEqual({ startDate: '2026-05-17', endDate: '2026-05-31' })
  })
})
