// server/utils/crm/healthScoring.ts
// Pure, deterministic customer-HEALTH scoring (P4.2). A 0–100 score from post-sale
// signals — the inverse of churn risk. Four components map onto the existing
// crm_scores component columns (score_type='health', no migration):
//   engagement → engagement_score, support → intent_score,
//   relationship → fit_score, contract → recency_score.
// Mirrors crm-dashboard-main's customer_health_scores. Higher = healthier.

export interface HealthSignals {
  lastEngagementAt: string | null     // most recent activity OR communication
  openOverdueTasks: number            // open tasks past their due date
  commsLast30: number                 // communications in the last 30 days
  contractDaysToExpiry: number | null // days to the nearest contract expiry (null = none on file)
}

export interface HealthResult {
  engagement: number
  support: number
  relationship: number
  contract: number
  total: number
  grade: 'Hot' | 'Warm' | 'Cold'
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n))

// 0–35 — recency of any touch (activity or comm).
export function engagementHealth(lastEngagementAt: string | null, now: Date): number {
  if (!lastEngagementAt) return 0
  const days = (now.getTime() - new Date(lastEngagementAt).getTime()) / 86400000
  if (days <= 14) return 35
  if (days <= 30) return 25
  if (days <= 60) return 15
  if (days <= 90) return 8
  return 0
}

// 0–20 — open overdue tasks drag health down (5 each, floored).
export function supportHealth(openOverdueTasks: number): number {
  return clamp(20 - openOverdueTasks * 5, 20)
}

// 0–20 — recent two-way comms cadence (5 each, saturating at 4).
export function relationshipHealth(commsLast30: number): number {
  return clamp(Math.min(commsLast30, 4) * 5, 20)
}

// 0–25 — renewal proximity risk. No contract on file is neutral, not penalised.
export function contractHealth(daysToExpiry: number | null): number {
  if (daysToExpiry == null) return 15
  if (daysToExpiry <= 7) return 0   // expiring within a week, or already expired
  if (daysToExpiry <= 30) return 8
  if (daysToExpiry <= 90) return 18
  return 25
}

// Reuses the shared grade column (CHECK Hot/Warm/Cold). For health these read as
// Healthy / At risk / Critical — the UI relabels by score_type.
export function gradeForHealth(total: number): 'Hot' | 'Warm' | 'Cold' {
  if (total >= 70) return 'Hot'
  if (total >= 40) return 'Warm'
  return 'Cold'
}

export function scoreHealth(s: HealthSignals, now: Date): HealthResult {
  const engagement = engagementHealth(s.lastEngagementAt, now)
  const support = supportHealth(s.openOverdueTasks)
  const relationship = relationshipHealth(s.commsLast30)
  const contract = contractHealth(s.contractDaysToExpiry)
  const total = clamp(engagement + support + relationship + contract, 100)
  return { engagement, support, relationship, contract, total, grade: gradeForHealth(total) }
}
