import { describe, it, expect } from 'vitest'
import {
  partitionReminders,
  isDormant,
  resolveDormancyDays,
  REMINDER_FLOOD_WINDOW_HOURS,
  DEFAULT_DORMANCY_DAYS,
  type ReminderTask,
} from '~~/server/utils/crm/activation'

const now = new Date('2026-06-02T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString()

function task(over: Partial<ReminderTask>): ReminderTask {
  return { id: 't', client_id: 'c', title: 'T', assigned_to: 'u1', reminder_at: hoursAgo(1), due_at: null, ...over }
}

describe('partitionReminders', () => {
  it('notifies a recently-due reminder with an assignee', () => {
    const p = partitionReminders([task({ reminder_at: hoursAgo(1) })], now)
    expect(p.toNotify).toHaveLength(1)
    expect(p.toDrain).toHaveLength(0)
  })

  it('drains (no notify) reminders older than the flood window — anti-flood on first run', () => {
    const p = partitionReminders([task({ id: 'old', reminder_at: hoursAgo(REMINDER_FLOOD_WINDOW_HOURS + 5) })], now)
    expect(p.toNotify).toHaveLength(0)
    expect(p.toDrain.map(t => t.id)).toEqual(['old'])
  })

  it('drains tasks with no assignee (cannot notify) but still marks them', () => {
    const p = partitionReminders([task({ id: 'na', assigned_to: null, reminder_at: hoursAgo(1) })], now)
    expect(p.toNotify).toHaveLength(0)
    expect(p.toDrain.map(t => t.id)).toEqual(['na'])
  })

  it('splits a mixed batch correctly', () => {
    const p = partitionReminders([
      task({ id: 'fresh', reminder_at: hoursAgo(2) }),
      task({ id: 'ancient', reminder_at: hoursAgo(100) }),
      task({ id: 'noassignee', assigned_to: null, reminder_at: hoursAgo(2) }),
    ], now)
    expect(p.toNotify.map(t => t.id)).toEqual(['fresh'])
    expect(p.toDrain.map(t => t.id).sort()).toEqual(['ancient', 'noassignee'])
  })
})

describe('isDormant', () => {
  it('is true when last touch is older than the threshold', () => {
    expect(isDormant(hoursAgo(91 * 24), now, 90)).toBe(true)
  })
  it('is false when last touch is within the threshold', () => {
    expect(isDormant(hoursAgo(10 * 24), now, 90)).toBe(false)
  })
  it('is exactly-at-threshold inclusive (>= days)', () => {
    expect(isDormant(hoursAgo(90 * 24), now, 90)).toBe(true)
  })
  it('never goes dormant without evidence (null last-touch → false)', () => {
    expect(isDormant(null, now, 90)).toBe(false)
  })
  it('never goes dormant when threshold is non-positive', () => {
    expect(isDormant(hoursAgo(1000 * 24), now, 0)).toBe(false)
  })
})

describe('resolveDormancyDays', () => {
  it('uses the per-client setting when valid', () => {
    expect(resolveDormancyDays(45)).toBe(45)
  })
  it('falls back to the default when unset or non-positive', () => {
    expect(resolveDormancyDays(null)).toBe(DEFAULT_DORMANCY_DAYS)
    expect(resolveDormancyDays(undefined)).toBe(DEFAULT_DORMANCY_DAYS)
    expect(resolveDormancyDays(0)).toBe(DEFAULT_DORMANCY_DAYS)
  })
})
