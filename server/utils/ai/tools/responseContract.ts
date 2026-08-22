/**
 * Single source of truth for sync-staleness thresholds. The SQL copies in
 * /api/agency/social/spend/summary and /api/agency/budget-alerts/health take these via
 * MAKE_INTERVAL so the classifier and the row counter can never disagree.
 */
export const STALENESS_THRESHOLD_HOURS = 48
/** Pacing reads refuse to advise once the newest sync is older than this (promise P-02). */
export const PACING_HALT_HOURS = 23.5
/** A source whose campaign count shrank by more than this (percent) halts pacing reads (G-2 residue). */
export const COVERAGE_DROP_HALT_PCT = 5

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
  const stalenessThresholdHours = Math.max(1, Math.trunc(options.stalenessThresholdHours ?? STALENESS_THRESHOLD_HOURS))
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

export interface PaginationSourceInfo {
  /** True total at the source (e.g. COUNT(*)) when the array handed in was already capped upstream. */
  sourceTotal?: number
  /** The array handed in was truncated before pagination (SQL LIMIT, slice, provider page cap). */
  truncatedAtSource?: boolean
}

export function paginateWithCursor<T>(rows: T[], cursor?: string, limit = 20, source: PaginationSourceInfo = {}): {
  items: T[]
  nextCursor: string | null
  total: number
  more: number
  truncatedAtSource: boolean
} {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  const offset = cursorOffset(cursor)
  const items = rows.slice(offset, offset + safeLimit)
  const nextOffset = offset + items.length
  const total = Number.isFinite(source.sourceTotal)
    ? Math.max(rows.length, Math.trunc(source.sourceTotal as number))
    : rows.length
  const remaining = Math.max(0, total - nextOffset)
  return {
    items,
    nextCursor: rows.length - nextOffset > 0 ? cursorForOffset(nextOffset) : null,
    total,
    more: remaining,
    truncatedAtSource: source.truncatedAtSource === true || total > rows.length,
  }
}

export type HaltReason = 'stale_sync' | 'no_sync_record' | 'coverage_drop' | 'stale_coverage_baseline'

export type HaltVerdict =
  | { halted: false }
  | { halted: true, haltReason: HaltReason, haltDetail: string, asOf: SyncFreshness }

/**
 * Read-side halt (promise P-02): when the data cannot be trusted the tool says so and returns no
 * figures. Pure — callers inject `now` for deterministic tests. `coverageDelta` is the
 * getSpendCoverageDeltas() map; any platform whose count fell by more than COVERAGE_DROP_HALT_PCT halts.
 */
/** `google_ads` (summary route) and `google` (sync jobs / tool enums) are the same platform. */
function normalizeHaltPlatform(value: string | null | undefined): string | null {
  const v = String(value ?? '').trim().toLowerCase()
  if (!v || v === 'all') return null
  return v === 'google_ads' ? 'google' : v
}

export function evaluateHalt(
  freshness: SyncFreshness,
  options: {
    haltAfterHours: number
    now?: Date
    coverageDelta?: Record<string, { deltaPct?: number | null, staleBaseline?: boolean } | null | undefined> | null
    coverageDropHaltPct?: number
    /**
     * Platform the read is scoped to (`meta` | `google` | `google_ads`). When set, only that
     * platform's coverage baseline/drop can halt the read — one broken platform must not darken a
     * healthy one. Omit / `'all'` for portfolio reads, which gate on every platform and name the culprit.
     */
    platform?: string | null
  },
): HaltVerdict {
  const nowMs = (options.now ?? new Date()).getTime()
  const haltAfterHours = Math.max(1, options.haltAfterHours)
  if (!freshness.lastSyncedAt) {
    return {
      halted: true,
      haltReason: 'no_sync_record',
      haltDetail: 'No sync timestamp exists for this data; figures withheld until a sync lands.',
      asOf: freshness,
    }
  }
  const lastMs = Date.parse(freshness.lastSyncedAt)
  if (!Number.isFinite(lastMs) || nowMs - lastMs > haltAfterHours * 3_600_000) {
    return {
      halted: true,
      haltReason: 'stale_sync',
      haltDetail: `Newest sync ${freshness.lastSyncedAt} is older than ${haltAfterHours}h; figures withheld until a sync lands.`,
      asOf: freshness,
    }
  }
  const dropPct = options.coverageDropHaltPct ?? COVERAGE_DROP_HALT_PCT
  const scope = normalizeHaltPlatform(options.platform)
  const coverageEntries = Object.entries(options.coverageDelta ?? {})
    .filter(([platform]) => scope === null || normalizeHaltPlatform(platform) === scope)
  const staleBaselines = coverageEntries
    .filter(([, delta]) => delta?.staleBaseline === true)
    .map(([platform]) => platform)
  if (staleBaselines.length > 0) {
    return {
      halted: true,
      haltReason: 'stale_coverage_baseline',
      haltDetail: `Coverage baseline is older than 48h or missing for ${staleBaselines.join(', ')}; figures withheld until a fresh comparison run exists.`,
      asOf: freshness,
    }
  }
  const dropped = coverageEntries
    .filter(([, delta]) => typeof delta?.deltaPct === 'number' && (delta.deltaPct as number) < -dropPct)
    .map(([platform, delta]) => `${platform} ${delta?.deltaPct}%`)
  if (dropped.length > 0) {
    return {
      halted: true,
      haltReason: 'coverage_drop',
      haltDetail: `Campaign coverage fell beyond ${dropPct}% on the last sync (${dropped.join(', ')}); figures withheld until coverage is confirmed.`,
      asOf: freshness,
    }
  }
  return { halted: false }
}
