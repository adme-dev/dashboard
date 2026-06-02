// server/utils/crm/nextBestAction.ts
// Deterministic, explainable next-best-action ranking for an opportunity (P4.3).
// No LLM — every suggestion is a rule whose reason cites the signal that fired
// it, so reps can trust it. The endpoint gathers signals; this does the logic
// (pure, TDD). Groq is reserved for the auto-drafted follow-up TEXT (aiDraft.ts).

export interface OppSignals {
  status: 'open' | 'won' | 'lost'
  stageName: string | null
  stageIsWon: boolean
  stageIsLost: boolean
  daysSinceLastActivity: number | null // null = never
  daysSinceCreated: number
  openTaskCount: number
  overdueTaskCount: number
  daysSinceLastComm: number | null      // null = never
  leadScore: number | null              // 0–100, or null if unscored
}

export type NbaPriority = 'high' | 'medium' | 'low'

export interface NbaSuggestion {
  key: 'add_next_step' | 'clear_overdue' | 're_engage' | 'log_comm' | 'qualify' | 'review_stage'
  title: string
  reason: string
  priority: NbaPriority
}

const STALE_ACTIVITY_DAYS = 14
const QUIET_COMMS_DAYS = 21
const LONG_OPEN_DAYS = 30
const LOW_SCORE = 40

const RANK: Record<NbaPriority, number> = { high: 0, medium: 1, low: 2 }

export function nextBestActions(s: OppSignals): NbaSuggestion[] {
  // Closed deals need no next action.
  if (s.status !== 'open') return []

  const out: NbaSuggestion[] = []

  if (s.overdueTaskCount > 0) {
    out.push({
      key: 'clear_overdue',
      title: s.overdueTaskCount === 1 ? 'Clear 1 overdue task' : `Clear ${s.overdueTaskCount} overdue tasks`,
      reason: `This deal has ${s.overdueTaskCount} overdue task${s.overdueTaskCount === 1 ? '' : 's'}.`,
      priority: 'high',
    })
  }

  if (s.openTaskCount === 0) {
    out.push({
      key: 'add_next_step',
      title: 'Add a next step',
      reason: 'No open task — the deal has no scheduled next step.',
      priority: 'high',
    })
  }

  if (s.daysSinceLastActivity === null) {
    out.push({
      key: 're_engage',
      title: 'Re-engage this deal',
      reason: 'No activity has ever been logged on this deal.',
      priority: 'high',
    })
  } else if (s.daysSinceLastActivity > STALE_ACTIVITY_DAYS) {
    out.push({
      key: 're_engage',
      title: 'Re-engage this deal',
      reason: `No activity logged in ${s.daysSinceLastActivity} days.`,
      priority: 'high',
    })
  }

  const commGap = s.daysSinceLastComm
  if (commGap === null || commGap > QUIET_COMMS_DAYS) {
    out.push({
      key: 'log_comm',
      title: 'Reach out / log a touchpoint',
      reason: commGap === null
        ? 'No communication has been logged with this contact.'
        : `No communication logged in ${commGap} days.`,
      priority: 'medium',
    })
  }

  if (s.leadScore != null && s.leadScore < LOW_SCORE) {
    out.push({
      key: 'qualify',
      title: 'Qualify further',
      reason: `Lead score is low (${s.leadScore}/100) — confirm fit and intent.`,
      priority: 'medium',
    })
  }

  if (s.daysSinceCreated > LONG_OPEN_DAYS && !s.stageIsWon && !s.stageIsLost) {
    out.push({
      key: 'review_stage',
      title: 'Review the stage',
      reason: `Open for ${s.daysSinceCreated} days${s.stageName ? ` in "${s.stageName}"` : ''} — confirm it's still progressing.`,
      priority: 'low',
    })
  }

  // Stable sort by priority (high → low), preserving insertion order within a band.
  return out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => RANK[x.a.priority] - RANK[y.a.priority] || x.i - y.i)
    .map(({ a }) => a)
}
