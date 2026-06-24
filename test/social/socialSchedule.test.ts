import { describe, it, expect } from 'vitest'
import { CalendarDate } from '@internationalized/date'
import { isoToScheduleParts, partsToIso } from '../../app/utils/socialSchedule'

describe('isoToScheduleParts', () => {
  // The compose schedule bridge must read the calendar date AND the time-of-day
  // in the SAME (post) timezone. The production bug derived the date from the
  // raw UTC slice while the time came from the post tz, so for an instant whose
  // UTC date differs from its local date the two disagreed and the date/time
  // watches looped forever — blanking the compose page. This is that case:
  // the calendar "+" passes local midnight, which for AEST serializes to T14:00Z.
  it('derives the date and time in the post timezone, not UTC', () => {
    const { date, time } = isoToScheduleParts('2026-06-09T14:00:00.000Z', 'Australia/Sydney')
    // In Sydney (UTC+10) that instant is 10 Jun 2026 00:00 — NOT the UTC 9th.
    expect(date?.toString()).toBe('2026-06-10')
    expect(time).toBe('00:00')
  })

  it('handles negative-offset zones the same way', () => {
    const { date, time } = isoToScheduleParts('2026-06-09T02:00:00.000Z', 'America/New_York')
    // In New York (UTC-4 in June) that instant is 8 Jun 2026 22:00.
    expect(date?.toString()).toBe('2026-06-08')
    expect(time).toBe('22:00')
  })

  it('defaults to a null date and 09:00 when there is no instant', () => {
    expect(isoToScheduleParts(null, 'Australia/Sydney')).toEqual({ date: null, time: '09:00' })
  })
})

describe('partsToIso', () => {
  it('combines a calendar date + HH:MM, interpreted in the post timezone, into a UTC instant', () => {
    const iso = partsToIso(new CalendarDate(2026, 6, 10), '00:00', 'Australia/Sydney')
    expect(iso).toBe('2026-06-09T14:00:00.000Z')
  })

  it('returns null when there is no date', () => {
    expect(partsToIso(null, '09:00', 'Australia/Sydney')).toBeNull()
  })
})

describe('schedule bridge round-trip', () => {
  // The production watch loop happened because the ISO->parts->ISO round-trip
  // was NOT a fixed point (the date drifted a day each cycle). This guards it:
  // re-deriving parts from the recombined instant must return identical parts.
  it('is a stable fixed point for a local-midnight instant (no day drift)', () => {
    const tz = 'Australia/Sydney'
    const start = isoToScheduleParts('2026-06-09T14:00:00.000Z', tz)
    const iso = partsToIso(start.date, start.time, tz)
    const again = isoToScheduleParts(iso, tz)
    expect(again.date?.toString()).toBe(start.date?.toString())
    expect(again.time).toBe(start.time)
    // and the instant itself is unchanged
    expect(iso).toBe('2026-06-09T14:00:00.000Z')
  })

  it('is stable across several afternoon and morning times in a +offset zone', () => {
    const tz = 'Australia/Sydney'
    for (const iso of [
      '2026-06-09T14:00:00.000Z', // local midnight
      '2026-06-09T23:00:00.000Z', // local 09:00
      '2026-06-09T03:30:00.000Z', // local 13:30
      '2026-12-31T13:00:00.000Z', // local midnight, DST (AEDT +11)
    ]) {
      const parts = isoToScheduleParts(iso, tz)
      const back = partsToIso(parts.date, parts.time, tz)
      const reparts = isoToScheduleParts(back, tz)
      expect(reparts.date?.toString()).toBe(parts.date?.toString())
      expect(reparts.time).toBe(parts.time)
    }
  })
})
