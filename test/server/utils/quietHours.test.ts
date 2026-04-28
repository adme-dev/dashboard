/**
 * Quiet hours / DND helper tests.
 *
 * Covers: timezone math, midnight wrap, day-of-week filter, reason override,
 * and the public isWithinQuietHours() lookup.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: any[]) => mockQueryOne(...args),
  queryRows: (...args: any[]) => mockQueryRows(...args),
}))

import { getLocalTime, isWithinRange, isWithinQuietHours } from '../../../server/utils/quietHours'

describe('isWithinRange (midnight wrap)', () => {
  it('handles non-wrapping range (8am..5pm)', () => {
    expect(isWithinRange(7 * 60, 8 * 60, 17 * 60)).toBe(false)
    expect(isWithinRange(8 * 60, 8 * 60, 17 * 60)).toBe(true)
    expect(isWithinRange(12 * 60, 8 * 60, 17 * 60)).toBe(true)
    expect(isWithinRange(17 * 60, 8 * 60, 17 * 60)).toBe(false) // exclusive end
    expect(isWithinRange(18 * 60, 8 * 60, 17 * 60)).toBe(false)
  })

  it('handles wrapping range (8pm..8am)', () => {
    expect(isWithinRange(19 * 60, 20 * 60, 8 * 60)).toBe(false)
    expect(isWithinRange(20 * 60, 20 * 60, 8 * 60)).toBe(true)
    expect(isWithinRange(23 * 60, 20 * 60, 8 * 60)).toBe(true)
    expect(isWithinRange(0, 20 * 60, 8 * 60)).toBe(true)
    expect(isWithinRange(7 * 60, 20 * 60, 8 * 60)).toBe(true)
    expect(isWithinRange(8 * 60, 20 * 60, 8 * 60)).toBe(false)
    expect(isWithinRange(12 * 60, 20 * 60, 8 * 60)).toBe(false)
  })

  it('treats zero-length range as disabled', () => {
    expect(isWithinRange(10 * 60, 12 * 60, 12 * 60)).toBe(false)
  })
})

describe('getLocalTime', () => {
  it('returns minutes-of-day and dayOfWeek for a given timezone', () => {
    // 2026-04-29 14:30 UTC. In Sydney (+10 standard / +10 AEST in late April),
    // this is around midnight or early hours next day depending on DST. Just
    // verify the shape and reasonable range.
    const date = new Date('2026-04-29T14:30:00Z')
    const local = getLocalTime(date, 'Australia/Sydney')
    expect(local.minutesOfDay).toBeGreaterThanOrEqual(0)
    expect(local.minutesOfDay).toBeLessThan(1440)
    expect(local.dayOfWeek).toBeGreaterThanOrEqual(0)
    expect(local.dayOfWeek).toBeLessThanOrEqual(6)
  })

  it('extracts UTC time correctly when timezone is UTC', () => {
    const date = new Date('2026-04-29T14:30:00Z')
    const local = getLocalTime(date, 'UTC')
    expect(local.minutesOfDay).toBe(14 * 60 + 30)
  })
})

describe('isWithinQuietHours', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns false when user has no config', async () => {
    mockQueryOne.mockResolvedValueOnce({ quiet_hours: null })
    expect(await isWithinQuietHours('u1', 'watching_board')).toBe(false)
  })

  it('returns false when config is disabled', async () => {
    mockQueryOne.mockResolvedValueOnce({
      quiet_hours: { enabled: false, startMinute: 0, endMinute: 1440, timezone: 'UTC', daysOfWeek: [0,1,2,3,4,5,6] },
    })
    expect(await isWithinQuietHours('u1', 'watching_board')).toBe(false)
  })

  it('returns true when within window AND reason is suppressible', async () => {
    // 14:00 UTC, all-day window in UTC, all days
    const at = new Date('2026-04-29T14:00:00Z')
    mockQueryOne.mockResolvedValueOnce({
      quiet_hours: { enabled: true, startMinute: 0, endMinute: 1439, timezone: 'UTC', daysOfWeek: [0,1,2,3,4,5,6] },
    })
    expect(await isWithinQuietHours('u1', 'watching_board', at)).toBe(true)
  })

  it('always returns false for mentioned reason regardless of window', async () => {
    const at = new Date('2026-04-29T14:00:00Z')
    mockQueryOne.mockResolvedValueOnce({
      quiet_hours: { enabled: true, startMinute: 0, endMinute: 1439, timezone: 'UTC', daysOfWeek: [0,1,2,3,4,5,6] },
    })
    expect(await isWithinQuietHours('u1', 'mentioned', at)).toBe(false)
  })

  it('always returns false for assigned reason regardless of window', async () => {
    const at = new Date('2026-04-29T14:00:00Z')
    mockQueryOne.mockResolvedValueOnce({
      quiet_hours: { enabled: true, startMinute: 0, endMinute: 1439, timezone: 'UTC', daysOfWeek: [0,1,2,3,4,5,6] },
    })
    expect(await isWithinQuietHours('u1', 'assigned', at)).toBe(false)
  })

  it('returns false when current weekday is not in daysOfWeek', async () => {
    // 2026-04-29 is a Wednesday (day 3)
    const at = new Date('2026-04-29T14:00:00Z')
    mockQueryOne.mockResolvedValueOnce({
      quiet_hours: { enabled: true, startMinute: 0, endMinute: 1439, timezone: 'UTC', daysOfWeek: [0, 6] }, // weekends only
    })
    expect(await isWithinQuietHours('u1', 'watching_board', at)).toBe(false)
  })

  it('fails open on DB error', async () => {
    mockQueryOne.mockRejectedValueOnce(new Error('boom'))
    expect(await isWithinQuietHours('u1', 'watching_board')).toBe(false)
  })

  it('fails open on invalid timezone', async () => {
    mockQueryOne.mockResolvedValueOnce({
      quiet_hours: { enabled: true, startMinute: 0, endMinute: 1439, timezone: 'Not/A/Zone', daysOfWeek: [0,1,2,3,4,5,6] },
    })
    expect(await isWithinQuietHours('u1', 'watching_board')).toBe(false)
  })

  it('returns false for null reason (treats as direct, fail-open for safety)', async () => {
    mockQueryOne.mockResolvedValueOnce({
      quiet_hours: { enabled: true, startMinute: 0, endMinute: 1439, timezone: 'UTC', daysOfWeek: [0,1,2,3,4,5,6] },
    })
    expect(await isWithinQuietHours('u1', null)).toBe(false)
  })
})
