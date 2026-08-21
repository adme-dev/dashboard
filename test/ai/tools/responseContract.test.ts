import { describe, expect, it } from 'vitest'
import {
  buildDataHealth,
  buildSyncFreshness,
  mergeSyncFreshness,
  paginateWithCursor,
  evaluateHalt,
  PACING_HALT_HOURS,
  STALENESS_THRESHOLD_HOURS,
} from '~~/server/utils/ai/tools/responseContract'

describe('MCP response contract helpers', () => {
  it('distinguishes populated, partial, not-configured, and unavailable data', () => {
    expect(buildDataHealth({ configured: false, expected: 22, withData: 0 })).toEqual({
      dataStatus: 'not_configured',
      coverage: { expected: 22, withData: 0 },
    })
    expect(buildDataHealth({ configured: true, expected: 22, withData: 4 }).dataStatus).toBe('partial')
    expect(buildDataHealth({ configured: true, expected: 22, withData: 22 }).dataStatus).toBe('populated')
    expect(buildDataHealth({ configured: true, available: false, expected: 22, withData: 0 }).dataStatus).toBe('unavailable')
  })

  it('never reports configured zero-coverage data as populated', () => {
    expect(buildDataHealth({ configured: true, expected: 0, withData: 0 })).toEqual({
      dataStatus: 'partial',
      coverage: { expected: 0, withData: 0 },
    })
    expect(buildDataHealth({ configured: true, expected: 5, withData: 0 }).dataStatus).toBe('partial')
  })

  it('reports worst-case sync freshness and counts missing timestamps as stale', () => {
    expect(buildSyncFreshness(
      ['2026-08-18T08:30:00Z', '2026-08-15T06:00:00Z', null, 'not-a-date'],
      { now: new Date('2026-08-19T12:00:00Z') },
    )).toEqual({
      lastSyncedAt: '2026-08-18T08:30:00Z',
      oldestSyncedAt: '2026-08-15T06:00:00Z',
      staleRowCount: 3,
      stalenessThresholdHours: 48,
      freshness: 'mixed',
    })
  })

  it('returns an explicit empty freshness summary when there are no source rows', () => {
    expect(buildSyncFreshness([], { now: new Date('2026-08-19T12:00:00Z') })).toEqual({
      lastSyncedAt: null,
      oldestSyncedAt: null,
      staleRowCount: 0,
      stalenessThresholdHours: 48,
      freshness: 'stale',
    })
  })

  it('merges pre-aggregated freshness without hiding stale rows behind a newer sync', () => {
    expect(mergeSyncFreshness([
      { lastSyncedAt: '2026-08-18T08:30:00Z', oldestSyncedAt: '2026-08-07T01:00:00Z', staleRowCount: 4, freshness: 'stale' },
      { lastSyncedAt: '2026-08-18T09:00:00Z', oldestSyncedAt: '2026-08-16T01:00:00Z', staleRowCount: 1, freshness: 'mixed' },
    ])).toEqual({
      lastSyncedAt: '2026-08-18T09:00:00Z',
      oldestSyncedAt: '2026-08-07T01:00:00Z',
      staleRowCount: 5,
      stalenessThresholdHours: 48,
      freshness: 'mixed',
    })
  })

  it('paginates with an opaque cursor and exact totals', () => {
    const rows = Array.from({ length: 25 }, (_, i) => `row-${i}`)
    const first = paginateWithCursor(rows, undefined, 20)
    expect(first.items).toEqual(rows.slice(0, 20))
    expect(first.total).toBe(25)
    expect(first.more).toBe(5)
    expect(first.nextCursor).toBeTruthy()

    const second = paginateWithCursor(rows, first.nextCursor, 20)
    expect(second.items).toEqual(rows.slice(20))
    expect(second.total).toBe(25)
    expect(second.more).toBe(0)
    expect(second.nextCursor).toBeNull()
  })

  it('rejects malformed cursors instead of silently restarting at page one', () => {
    expect(() => paginateWithCursor(['a'], 'not-a-cursor', 20)).toThrow(/cursor/i)
  })

  it('declares source-side truncation and prefers the true source total over the capped array', () => {
    const rows = Array.from({ length: 100 }, (_, i) => `row-${i}`)
    const plain = paginateWithCursor(rows, undefined, 20)
    expect(plain.truncatedAtSource).toBe(false)
    expect(plain.total).toBe(100)

    const capped = paginateWithCursor(rows, undefined, 20, { truncatedAtSource: true })
    expect(capped.truncatedAtSource).toBe(true)
    expect(capped.total).toBe(100)

    const counted = paginateWithCursor(rows, undefined, 20, { sourceTotal: 4_212, truncatedAtSource: true })
    expect(counted.total).toBe(4_212)
    expect(counted.more).toBe(4_192)
    expect(counted.truncatedAtSource).toBe(true)
  })

  it('exports the staleness constants that SQL and tools share', () => {
    expect(STALENESS_THRESHOLD_HOURS).toBe(48)
    expect(PACING_HALT_HOURS).toBe(23.5)
    expect(buildSyncFreshness([], {}).stalenessThresholdHours).toBe(STALENESS_THRESHOLD_HOURS)
  })

  describe('evaluateHalt', () => {
    const now = new Date('2026-08-20T12:00:00Z')
    const fresh = (lastSyncedAt: string | null) => buildSyncFreshness([lastSyncedAt], { now })

    it('does not halt when the newest sync is inside the halt window', () => {
      expect(evaluateHalt(fresh('2026-08-19T13:00:00Z'), { haltAfterHours: PACING_HALT_HOURS, now }))
        .toEqual({ halted: false })
    })

    it('halts with stale_sync one minute past the window, carrying the as-of', () => {
      const freshness = fresh('2026-08-19T12:29:00Z')
      expect(evaluateHalt(freshness, { haltAfterHours: PACING_HALT_HOURS, now })).toEqual({
        halted: true,
        haltReason: 'stale_sync',
        haltDetail: 'Newest sync 2026-08-19T12:29:00Z is older than 23.5h; figures withheld until a sync lands.',
        asOf: freshness,
      })
    })

    it('halts with no_sync_record when there is no timestamp at all', () => {
      const result = evaluateHalt(fresh(null), { haltAfterHours: PACING_HALT_HOURS, now })
      expect(result.halted).toBe(true)
      expect(result.halted && result.haltReason).toBe('no_sync_record')
    })

    it('halts on a coverage drop beyond the threshold even when the sync is fresh', () => {
      const result = evaluateHalt(fresh('2026-08-20T11:00:00Z'), {
        haltAfterHours: PACING_HALT_HOURS,
        now,
        coverageDelta: { meta: { deltaPct: -12.5 }, google: { deltaPct: 0.4 } },
      })
      expect(result.halted).toBe(true)
      expect(result.halted && result.haltReason).toBe('coverage_drop')
      expect(result.halted && result.haltDetail).toContain('meta')
    })

    it('ignores a coverage delta inside the tolerance', () => {
      expect(evaluateHalt(fresh('2026-08-20T11:00:00Z'), {
        haltAfterHours: PACING_HALT_HOURS,
        now,
        coverageDelta: { meta: { deltaPct: -4.9 } },
      })).toEqual({ halted: false })
    })

    it('halts when the previous coverage baseline is stale', () => {
      const result = evaluateHalt(fresh('2026-08-20T11:00:00Z'), {
        haltAfterHours: PACING_HALT_HOURS,
        now,
        coverageDelta: { meta: { deltaPct: 0, staleBaseline: true } },
      })
      expect(result.halted).toBe(true)
      expect(result.halted && result.haltReason).toBe('stale_coverage_baseline')
    })
  })
})
