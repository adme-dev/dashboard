import { describe, it, expect } from 'vitest'
import { sessionize, detectRoutines, dedupeConsecutive, type ObservedEvent } from '~~/server/utils/ai/observe/sessionize'

const ev = (at: string, kind: string, over: Partial<ObservedEvent> = {}): ObservedEvent => ({ userId: 'u1', kind, at, ...over })

describe('dedupeConsecutive', () => {
  it('collapses runs of the same kind but keeps non-adjacent repeats', () => {
    expect(dedupeConsecutive(['a', 'a', 'b', 'a'])).toEqual(['a', 'b', 'a'])
    expect(dedupeConsecutive([])).toEqual([])
  })
})

describe('sessionize', () => {
  it('empty → no episodes', () => {
    expect(sessionize([])).toEqual([])
  })

  it('groups events within the gap into one episode, splits on a larger gap', () => {
    const episodes = sessionize([
      ev('2026-06-15T09:00:00Z', 'spend.sync'),
      ev('2026-06-15T09:10:00Z', 'budget.check'),     // +10m → same episode
      ev('2026-06-15T11:00:00Z', 'task.status'),       // +110m → new episode
    ], 30)
    expect(episodes).toHaveLength(2)
    expect(episodes[0]!.kinds).toEqual(['spend.sync', 'budget.check'])
    expect(episodes[0]!.start).toBe('2026-06-15T09:00:00Z')
    expect(episodes[0]!.end).toBe('2026-06-15T09:10:00Z')
    expect(episodes[1]!.kinds).toEqual(['task.status'])
  })

  it('sorts out-of-order events before grouping', () => {
    const episodes = sessionize([
      ev('2026-06-15T09:10:00Z', 'b'),
      ev('2026-06-15T09:00:00Z', 'a'),
    ], 30)
    expect(episodes).toHaveLength(1)
    expect(episodes[0]!.kinds).toEqual(['a', 'b'])
  })
})

describe('detectRoutines', () => {
  // The same Monday-9am sequence across 3 distinct weeks → a routine.
  const mondays = ['2026-06-01', '2026-06-08', '2026-06-15'].flatMap(day => [
    ev(`${day}T09:00:00Z`, 'spend.sync'),
    ev(`${day}T09:05:00Z`, 'budget.check'),
    ev(`${day}T09:10:00Z`, 'recap.draft'),
  ])

  it('promotes a pattern seen on enough distinct days', () => {
    const routines = detectRoutines(sessionize(mondays), 3)
    expect(routines).toHaveLength(1)
    expect(routines[0]!).toMatchObject({ weekday: 1, hour: 9, sequence: ['spend.sync', 'budget.check', 'recap.draft'], occurrences: 3 })
    expect(routines[0]!.lastSeen).toBe('2026-06-15T09:00:00Z')
  })

  it('does not promote a pattern below the occurrence threshold', () => {
    const twoWeeks = mondays.filter(e => !e.at.startsWith('2026-06-15'))
    expect(detectRoutines(sessionize(twoWeeks), 3)).toEqual([])
  })

  it('counts DISTINCT days, not raw episode count (same-day repeats don\'t inflate)', () => {
    const sameDayTwice = [
      ev('2026-06-01T09:00:00Z', 'a'), ev('2026-06-01T13:00:00Z', 'a'), // two episodes, one day
    ]
    expect(detectRoutines(sessionize(sameDayTwice), 2)).toEqual([])
  })

  it('excludes sensitive actions from the routine signature', () => {
    const withSensitive = ['2026-06-01', '2026-06-08', '2026-06-15'].flatMap(day => [
      ev(`${day}T09:00:00Z`, 'expense.approved', { sensitive: true }),
      ev(`${day}T09:05:00Z`, 'recap.draft'),
    ])
    const routines = detectRoutines(sessionize(withSensitive), 3)
    expect(routines).toHaveLength(1)
    expect(routines[0]!.sequence).toEqual(['recap.draft'])     // sensitive kind dropped
  })

  it('an entirely-sensitive episode contributes no routine', () => {
    const allSensitive = ['2026-06-01', '2026-06-08', '2026-06-15'].map(day =>
      ev(`${day}T09:00:00Z`, 'expense.approved', { sensitive: true }))
    expect(detectRoutines(sessionize(allSensitive), 3)).toEqual([])
  })
})
