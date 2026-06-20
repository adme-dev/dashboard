import type { UpsertMemoryInput } from '../memory/types'
import { sessionize, detectRoutines, type WorkEventSource } from './sessionize'
import { distillObserved, type ObserveDistillDeps } from './distill'

/**
 * Observe & Learn W-2 — per-user orchestrator (spec §3 pipeline). For one user: read their own recent
 * actions over a FIXED rolling window, sessionize into work episodes, detect recurring routines, distil
 * ≤3 observed memories, write them (`source='observed'`, `scope='user'`), then record the newest event
 * processed as a watermark.
 *
 * Why a fixed lookback window (not "since the watermark"): routine detection needs ≥MIN_OCCURRENCES
 * distinct days of the same pattern to co-occur in ONE pass. A monotonic "read only new events" watermark
 * would split a weekly routine's occurrences across daily passes so it could never reach 3 — the routine
 * would never be learned. So we re-read the whole window each run (idempotent: upsertMemory dedups), and
 * use the watermark ONLY to skip users with no new activity since last run (cost control) — never to bound
 * the read. This also removes any boundary-skip risk from a strict `>` cursor.
 *
 * Strictly user-scoped (the source enforces `actor = userId`); one person's behaviour is never folded
 * into another's memory. The whole pass is gated by `AI_OBSERVE_ENABLED` at the cron boundary.
 */

/** How many days back to read for routine detection — wide enough for a few weekly recurrences. */
export const ROUTINE_LOOKBACK_DAYS = 35
/** Max events to pull per user per pass — bounds cost (newest-first). */
export const OBSERVE_EVENT_LIMIT = 500
/** Min distinct days for a routine to count (matches W-1 detectRoutines default). */
export const MIN_OCCURRENCES = 3

export interface ObserveDeps extends ObserveDistillDeps {
  source: WorkEventSource
  /** Active staff user ids that have recent activity (the cron query bounds this set). */
  listActiveUserIds: () => Promise<string[]>
  /** ISO start of the routine-detection read window (now − ROUTINE_LOOKBACK_DAYS). */
  windowStart: () => string
  /** Watermark read — ISO of the newest event already processed for this user, or null on first run. */
  getWatermark: (userId: string) => Promise<string | null>
  /** Persist the advanced watermark + run stats for this user. */
  setWatermark: (userId: string, throughISO: string, stats: { events: number, memories: number }) => Promise<void>
  /** Existing memory contents for dedup (personal, recent). */
  recentContents: (userId: string) => Promise<string[]>
  /** Write one observed memory; returns the row id. */
  save: (input: UpsertMemoryInput) => Promise<string>
}

export interface ObserveUserResult {
  userId: string
  events: number
  routines: number
  memories: number
  skipped?: boolean
}

/** Observe a single user. Never throws — failures are swallowed so one user can't break the pass. */
export async function observeUser(userId: string, deps: ObserveDeps): Promise<ObserveUserResult> {
  const result: ObserveUserResult = { userId, events: 0, routines: 0, memories: 0 }
  try {
    const events = await deps.source.recentEvents(userId, deps.windowStart(), OBSERVE_EVENT_LIMIT)
    result.events = events.length
    if (events.length === 0) return result

    const newest = events[events.length - 1]!.at

    // Skip the model entirely when nothing new happened since the last pass (the newest event in the
    // window is one we already processed). Idempotent re-runs are safe; this just avoids needless cost.
    const watermark = await deps.getWatermark(userId)
    if (watermark && newest <= watermark) {
      result.skipped = true
      return result
    }

    const routines = detectRoutines(sessionize(events), MIN_OCCURRENCES)
    result.routines = routines.length

    if (routines.length > 0) {
      const existing = await deps.recentContents(userId).catch(() => [] as string[])
      const candidates = await distillObserved(routines, existing, { complete: deps.complete })
      for (const c of candidates) {
        try {
          await deps.save({
            userId,
            memType: c.memType,
            content: c.content,
            source: 'observed',
            scope: 'user',
            salience: c.salience,
            metadata: { observed: true }
          })
          result.memories++
        } catch {
          // one bad candidate (e.g. constraint race) must not abort the rest
        }
      }
    }

    // Record the newest event we've now processed so the next pass can skip if nothing newer arrives.
    await deps.setWatermark(userId, newest, { events: result.events, memories: result.memories })
    return result
  } catch {
    return result
  }
}

export interface ObservePassResult {
  users: number
  events: number
  memories: number
  perUser: ObserveUserResult[]
}

/**
 * Run a full observe pass over every active user. Per-user errors are isolated (observeUser never
 * throws). The flag gate lives at the cron boundary — by the time this runs the feature is enabled.
 */
export async function runObservePass(deps: ObserveDeps): Promise<ObservePassResult> {
  const userIds = await deps.listActiveUserIds()
  const perUser: ObserveUserResult[] = []
  for (const userId of userIds) {
    perUser.push(await observeUser(userId, deps))
  }
  return {
    users: perUser.length,
    events: perUser.reduce((n, r) => n + r.events, 0),
    memories: perUser.reduce((n, r) => n + r.memories, 0),
    perUser
  }
}
