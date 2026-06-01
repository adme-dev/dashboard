// server/utils/crm/scoring.ts
// Pure, deterministic lead-scoring. Four components (max 30/30/20/20 = 100) and a
// Hot/Warm/Cold grade. Transparent + unit-tested so reps can trust the breakdown.
// (score_type 'health' is reserved for Phase 4; this file computes the 'lead' score.)

export interface ScoreSignals {
  activityCount: number        // total logged activities (engagement)
  openOpportunities: number    // open deals on the contact (intent)
  lastActivityAt: string | null // most recent activity timestamp (recency)
  hasEmail: boolean            // fit signals
  hasPhone: boolean
  companyLinked: boolean
  hasJobTitle: boolean
}

export interface ScoreResult {
  engagement: number
  intent: number
  fit: number
  recency: number
  total: number
  grade: 'Hot' | 'Warm' | 'Cold'
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n))

// 5 pts per activity, saturates at 6 activities.
export function computeEngagement(s: ScoreSignals): number {
  return clamp(s.activityCount * 5, 30)
}

// 15 pts per open opportunity, saturates at 2.
export function computeIntent(s: ScoreSignals): number {
  return clamp(s.openOpportunities * 15, 30)
}

// 5 pts per present fit attribute (email / phone / company / job title).
export function computeFit(s: ScoreSignals): number {
  return clamp(
    (s.hasEmail ? 5 : 0) + (s.hasPhone ? 5 : 0) + (s.companyLinked ? 5 : 0) + (s.hasJobTitle ? 5 : 0),
    20,
  )
}

// Stepwise decay by days since the last activity.
export function computeRecency(lastActivityAt: string | null, now: Date): number {
  if (!lastActivityAt) return 0
  const days = (now.getTime() - new Date(lastActivityAt).getTime()) / 86400000
  if (days <= 7) return 20
  if (days <= 30) return 14
  if (days <= 90) return 7
  return 2
}

export function gradeFor(total: number): 'Hot' | 'Warm' | 'Cold' {
  if (total >= 70) return 'Hot'
  if (total >= 40) return 'Warm'
  return 'Cold'
}

export function scoreTarget(s: ScoreSignals, now: Date): ScoreResult {
  const engagement = computeEngagement(s)
  const intent = computeIntent(s)
  const fit = computeFit(s)
  const recency = computeRecency(s.lastActivityAt, now)
  const total = clamp(engagement + intent + fit + recency, 100)
  return { engagement, intent, fit, recency, total, grade: gradeFor(total) }
}
