import { describe, it, expect } from 'vitest'
import {
  RESCHEDULABLE_STATUSES,
  canReschedule,
  computeRescheduledAt
} from '../../app/utils/socialCalendar'

describe('canReschedule', () => {
  it('allows only draft, approved, and scheduled posts to be dragged', () => {
    for (const s of ['draft', 'approved', 'scheduled']) {
      expect(canReschedule(s)).toBe(true)
    }
    for (const s of ['publishing', 'published', 'partially_published', 'failed', 'cancelled']) {
      expect(canReschedule(s)).toBe(false)
    }
  })

  it('treats unknown statuses as not reschedulable', () => {
    expect(canReschedule('')).toBe(false)
    expect(canReschedule('archived')).toBe(false)
  })

  it('exposes the reschedulable status set', () => {
    expect(RESCHEDULABLE_STATUSES).toEqual(['draft', 'approved', 'scheduled'])
  })
})

describe('computeRescheduledAt', () => {
  it('keeps the post time-of-day and moves it to the target day', () => {
    const current = new Date(2026, 5, 10, 14, 30, 0) // 10 Jun 2026 14:30 local
    const target = new Date(2026, 5, 20, 0, 0, 0)     // 20 Jun 2026 local
    const res = new Date(computeRescheduledAt(current.toISOString(), target))
    expect(res.getFullYear()).toBe(2026)
    expect(res.getMonth()).toBe(5)
    expect(res.getDate()).toBe(20)
    expect(res.getHours()).toBe(14)
    expect(res.getMinutes()).toBe(30)
  })

  it('defaults to 09:00 local when the post has no scheduled time', () => {
    const target = new Date(2026, 0, 5, 0, 0, 0)
    const res = new Date(computeRescheduledAt(null, target))
    expect(res.getDate()).toBe(5)
    expect(res.getHours()).toBe(9)
    expect(res.getMinutes()).toBe(0)
  })

  it('returns a round-trippable ISO string', () => {
    const res = computeRescheduledAt(null, new Date(2026, 0, 5))
    expect(new Date(res).toISOString()).toBe(res)
  })
})
