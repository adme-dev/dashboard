import { describe, expect, it } from 'vitest'
import {
  listSearchConsoleDates,
  searchConsoleSyncWindow
} from '~~/server/utils/searchAuthority/dates'

describe('Search Console sync dates', () => {
  it('uses the Google provider day in America/Los_Angeles across UTC boundaries', () => {
    expect(searchConsoleSyncWindow({
      now: new Date('2026-08-01T05:30:00.000Z')
    })).toEqual({
      startDate: '2026-05-03',
      endDate: '2026-07-31',
      mode: 'initial'
    })
  })

  it('refreshes the trailing three provider days after the initial load', () => {
    expect(searchConsoleSyncWindow({
      now: new Date('2026-08-01T08:30:00.000Z'),
      hasSuccessfulSync: true
    })).toEqual({
      startDate: '2026-07-30',
      endDate: '2026-08-01',
      mode: 'refresh'
    })
  })

  it('accepts valid manual leap-day ranges and caps them at 90 inclusive days', () => {
    expect(searchConsoleSyncWindow({
      startDate: '2028-02-29',
      endDate: '2028-03-01'
    })).toEqual({
      startDate: '2028-02-29',
      endDate: '2028-03-01',
      mode: 'manual'
    })
    expect(() => searchConsoleSyncWindow({
      startDate: '2026-01-01',
      endDate: '2026-04-01'
    })).toThrow('90 days')
    expect(() => searchConsoleSyncWindow({
      startDate: '2026-02-30',
      endDate: '2026-03-01'
    })).toThrow('valid YYYY-MM-DD')
  })

  it('enumerates inclusive ISO dates without local-time drift', () => {
    expect(listSearchConsoleDates('2028-02-28', '2028-03-01')).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01'
    ])
  })
})
