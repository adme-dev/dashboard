export type DataStatus = 'populated' | 'partial' | 'not_configured' | 'unavailable'

export interface DataHealth {
  dataStatus: DataStatus
  coverage: { expected: number, withData: number }
}

export interface SyncFreshness {
  lastSyncedAt: string | null
  oldestSyncedAt: string | null
  staleRowCount: number
  stalenessThresholdHours: number
  freshness: 'fresh' | 'stale' | 'mixed'
}

export type AggregatedSyncFreshness = Partial<Pick<SyncFreshness,
  'lastSyncedAt' | 'oldestSyncedAt' | 'staleRowCount' | 'freshness'
>>

export function buildDataHealth(input: {
  configured: boolean
  available?: boolean
  expected: number
  withData: number
}): DataHealth {
  const expected = Math.max(0, Math.trunc(input.expected))
  const withData = Math.min(expected, Math.max(0, Math.trunc(input.withData)))
  const dataStatus: DataStatus = input.available === false
    ? 'unavailable'
    : !input.configured
      ? 'not_configured'
      : withData === 0 || withData < expected
        ? 'partial'
        : 'populated'

  return { dataStatus, coverage: { expected, withData } }
}

export function buildSyncFreshness(
  timestamps: Array<string | Date | null | undefined>,
  options: { now?: Date, stalenessThresholdHours?: number } = {},
): SyncFreshness {
  const nowMs = (options.now ?? new Date()).getTime()
  const stalenessThresholdHours = Math.max(1, Math.trunc(options.stalenessThresholdHours ?? 48))
  const staleBefore = nowMs - stalenessThresholdHours * 3_600_000
  let newest: { value: string, time: number } | null = null
  let oldest: { value: string, time: number } | null = null
  let staleRowCount = 0

  for (const timestamp of timestamps) {
    const value = timestamp instanceof Date ? timestamp.toISOString() : timestamp
    if (!value) {
      staleRowCount += 1
      continue
    }
    const time = Date.parse(value)
    if (!Number.isFinite(time)) {
      staleRowCount += 1
      continue
    }
    if (time < staleBefore) staleRowCount += 1
    if (!newest || time > newest.time) newest = { value, time }
    if (!oldest || time < oldest.time) oldest = { value, time }
  }

  return {
    lastSyncedAt: newest?.value ?? null,
    oldestSyncedAt: oldest?.value ?? null,
    staleRowCount,
    stalenessThresholdHours,
    freshness: timestamps.length === 0 || staleRowCount >= timestamps.length
      ? 'stale'
      : staleRowCount === 0
        ? 'fresh'
        : 'mixed',
  }
}

export function mergeSyncFreshness(
  summaries: AggregatedSyncFreshness[],
  options: { now?: Date, stalenessThresholdHours?: number } = {},
): SyncFreshness {
  const timestampFreshness = buildSyncFreshness(
    summaries.flatMap(summary => [summary.lastSyncedAt, summary.oldestSyncedAt]),
    options,
  )
  const staleRowCount = summaries.reduce((sum, summary) => {
    if (Number.isFinite(summary.staleRowCount)) {
      return sum + Math.max(0, Math.trunc(Number(summary.staleRowCount)))
    }
    const representative = summary.oldestSyncedAt ?? summary.lastSyncedAt
    return sum + buildSyncFreshness([representative], options).staleRowCount
  }, 0)

  const states = summaries.map(summary => summary.freshness ?? (
    Number(summary.staleRowCount) > 0 ? 'stale' : 'fresh'
  ))
  const freshness = states.length === 0 || states.every(state => state === 'stale')
    ? 'stale'
    : states.every(state => state === 'fresh')
      ? 'fresh'
      : 'mixed'

  return { ...timestampFreshness, staleRowCount, freshness }
}

const CURSOR_PREFIX = 'xf1_'

export function cursorOffset(cursor?: string): number {
  if (!cursor) return 0
  if (!cursor.startsWith(CURSOR_PREFIX)) throw new Error('Invalid pagination cursor.')
  const value = Number.parseInt(cursor.slice(CURSOR_PREFIX.length), 36)
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid pagination cursor.')
  return value
}

export function cursorForOffset(offset: number): string | null {
  return offset > 0 ? `${CURSOR_PREFIX}${Math.trunc(offset).toString(36)}` : null
}

export function paginateWithCursor<T>(rows: T[], cursor?: string, limit = 20): {
  items: T[]
  nextCursor: string | null
  total: number
  more: number
} {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  const offset = cursorOffset(cursor)
  const items = rows.slice(offset, offset + safeLimit)
  const nextOffset = offset + items.length
  const remaining = Math.max(0, rows.length - nextOffset)
  return {
    items,
    nextCursor: remaining > 0 ? cursorForOffset(nextOffset) : null,
    total: rows.length,
    more: remaining,
  }
}
