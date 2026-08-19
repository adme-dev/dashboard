import { describe, expect, it } from 'vitest'
import {
  buildDataHealth,
  buildSyncFreshness,
  mergeSyncFreshness,
  paginateWithCursor,
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
})
