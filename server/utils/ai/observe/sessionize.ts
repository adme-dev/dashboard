/**
 * Observe & Learn — W-1 substrate (observe-and-learn spec §4). PURE, I/O-free episode grouping and
 * routine detection over a user's own platform actions. The real activity-table reads are injected via
 * `WorkEventSource` (implemented in W-2); this module is the deterministic core that turns a stream of
 * actions into work episodes and recurring-routine candidates — unit-testable without a database.
 */

/** One observed action, normalized from an existing activity/audit row. user_id-scoped by construction. */
export type ObservedEvent = {
  userId: string
  /** Stable action kind, e.g. 'task.assigned', 'task.status', 'expense.approved', 'crm.activity', 'proof.status'. */
  kind: string
  entityType?: string
  entityId?: string
  /** ISO timestamp of the action. */
  at: string
  /** Whether this kind is sensitive (finance approvals, etc.) — excluded from routine inference. */
  sensitive?: boolean
  meta?: Record<string, unknown>
}

/** A burst of actions with no gap larger than `gapMinutes` — one sitting of work. */
export type WorkEpisode = {
  userId: string
  start: string
  end: string
  /** Action kinds in order (may repeat). */
  kinds: string[]
  events: ObservedEvent[]
}

/** A recurring routine candidate — the same shape of episode seen on multiple distinct days. */
export type RoutineCandidate = {
  /** Stable signature: weekday + hour-bucket + the ordered, de-duplicated action sequence. */
  signature: string
  /** 0=Sun..6=Sat, or null if the routine isn't day-specific. */
  weekday: number | null
  /** Rough hour bucket (0–23) the routine tends to happen in. */
  hour: number | null
  /** The ordered, consecutive-deduplicated action kinds that make up the routine. */
  sequence: string[]
  /** How many DISTINCT days this pattern recurred. */
  occurrences: number
  lastSeen: string
}

/** The injected read surface (W-2 implements it over task_activities / crm_activities / … behind a watermark). */
export interface WorkEventSource {
  /** A user's own observable actions since `sinceISO` (ascending by `at`), capped. */
  recentEvents(userId: string, sinceISO: string, limit: number): Promise<ObservedEvent[]>
}

const MS_PER_MIN = 60_000

/** Collapse consecutive identical kinds ("a,a,b,a" → "a,b,a") so a routine signature ignores repeats. */
export function dedupeConsecutive(kinds: string[]): string[] {
  const out: string[] = []
  for (const k of kinds) if (out[out.length - 1] !== k) out.push(k)
  return out
}

/**
 * Group a user's events into episodes: a new episode starts whenever the gap from the previous event
 * exceeds `gapMinutes`. Events MUST be for a single user; they are sorted by `at` defensively.
 */
export function sessionize(events: ObservedEvent[], gapMinutes = 30): WorkEpisode[] {
  if (events.length === 0) return []
  const sorted = [...events].sort((a, b) => +new Date(a.at) - +new Date(b.at))
  const episodes: WorkEpisode[] = []
  let cur: ObservedEvent[] = [sorted[0]!]

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const e = sorted[i]!
    const gap = (+new Date(e.at) - +new Date(prev.at)) / MS_PER_MIN
    if (gap > gapMinutes) {
      episodes.push(toEpisode(cur))
      cur = []
    }
    cur.push(e)
  }
  episodes.push(toEpisode(cur))
  return episodes
}

function toEpisode(events: ObservedEvent[]): WorkEpisode {
  return {
    userId: events[0]!.userId,
    start: events[0]!.at,
    end: events[events.length - 1]!.at,
    kinds: events.map(e => e.kind),
    events,
  }
}

/**
 * Detect recurring routines: episodes that share a (weekday, hour-bucket, action-sequence) signature on
 * at least `minOccurrences` DISTINCT calendar days are routine candidates. Sensitive events are dropped
 * from the sequence before signing (we never learn "approve expenses every Friday" as a routine to
 * suggest). Episodes whose entire content is sensitive contribute nothing.
 */
export function detectRoutines(episodes: WorkEpisode[], minOccurrences = 3): RoutineCandidate[] {
  type Acc = { weekday: number, hour: number, sequence: string[], days: Set<string>, lastSeen: string }
  const groups = new Map<string, Acc>()

  for (const ep of episodes) {
    const nonSensitive = ep.events.filter(e => !e.sensitive)
    if (nonSensitive.length === 0) continue
    const sequence = dedupeConsecutive(nonSensitive.map(e => e.kind))
    const d = new Date(ep.start)
    if (Number.isNaN(d.getTime())) continue
    const weekday = d.getUTCDay()
    const hour = d.getUTCHours()
    const signature = `${weekday}|${hour}|${sequence.join('>')}`
    const day = ep.start.slice(0, 10) // YYYY-MM-DD — distinct-day key

    const acc = groups.get(signature) ?? { weekday, hour, sequence, days: new Set<string>(), lastSeen: ep.start }
    acc.days.add(day)
    if (ep.start > acc.lastSeen) acc.lastSeen = ep.start
    groups.set(signature, acc)
  }

  return [...groups.entries()]
    .map(([signature, a]): RoutineCandidate => ({
      signature, weekday: a.weekday, hour: a.hour, sequence: a.sequence,
      occurrences: a.days.size, lastSeen: a.lastSeen,
    }))
    .filter(r => r.occurrences >= minOccurrences)
    .sort((a, b) => b.occurrences - a.occurrences)
}
