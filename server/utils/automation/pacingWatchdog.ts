// server/utils/automation/pacingWatchdog.ts
import type { PacingReviewItem, PacingReviewIssueType } from '~~/server/utils/socialSpendPacingReview'
import type { EscalationInput } from '~~/server/utils/automation/escalations'

const ACTIONABLE_ISSUES: PacingReviewIssueType[] = ['overpacing', 'underpacing', 'no_spend', 'paused_with_budget', 'stale_sync']
const ACTIONABLE_SEVERITIES = ['critical', 'warning']

export function isActionablePacingItem(item: Pick<PacingReviewItem, 'issueType' | 'severity'>): boolean {
  return (ACTIONABLE_ISSUES as string[]).includes(item.issueType)
    && ACTIONABLE_SEVERITIES.includes(item.severity)
}

export function labelForIssue(issueType: string): string {
  switch (issueType) {
    case 'overpacing': return 'is over-pacing'
    case 'underpacing': return 'is under-pacing'
    case 'no_spend': return 'has no spend'
    case 'paused_with_budget': return 'is paused with budget'
    case 'stale_sync': return 'has stale spend data'
    default: return `needs review (${issueType})`
  }
}

export function pacingItemToEscalation(item: PacingReviewItem, opts: { runId?: string | null }): EscalationInput {
  let proposedAction: Record<string, any> | null = null
  const base = { platform: item.platform, campaignId: item.campaignId }
  if (item.issueType === 'overpacing') {
    proposedAction = { action: 'reduce_daily_budget', ...base, from: item.currentDailyBudget, to: item.recommendedDailyBudget }
  } else if (item.issueType === 'underpacing') {
    proposedAction = { action: 'increase_daily_budget', ...base, from: item.currentDailyBudget, to: item.recommendedDailyBudget }
  } else if (item.issueType === 'stale_sync') {
    proposedAction = { action: 'resync_spend', ...base }
  } else if (item.issueType === 'no_spend' || item.issueType === 'paused_with_budget') {
    proposedAction = { action: 'investigate_delivery', ...base }
  }
  return {
    capability: 'budget_pacing_watchdog',
    title: `${item.clientName}: ${item.campaignName} ${labelForIssue(item.issueType)} (${item.platform})`,
    severity: item.severity,
    clientId: null, // PacingReviewItem carries clientName, not id; client linkage is a later refinement.
    runId: opts.runId ?? null,
    detail: {
      campaignId: item.campaignId,
      campaignName: item.campaignName,
      clientName: item.clientName,
      platform: item.platform,
      issueType: item.issueType,
      budget: item.budget,
      mtdSpend: item.mtdSpend,
      projectedMonthEnd: item.projectedMonthEnd,
      pacingRatio: item.pacingRatio,
      currentDailyBudget: item.currentDailyBudget,
      recommendedDailyBudget: item.recommendedDailyBudget,
      recommendedAction: item.recommendedAction,
    },
    proposedAction,
  }
}

export function dedupeKey(d: { platform?: string | null, campaignId?: string | null, issueType?: string | null }): string {
  return `${d.platform ?? ''}::${d.campaignId ?? ''}::${d.issueType ?? ''}`
}

export function filterAlreadyPending(candidates: EscalationInput[], pendingDetails: Record<string, any>[]): EscalationInput[] {
  const seen = new Set(pendingDetails.map(d => dedupeKey({ platform: d.platform, campaignId: d.campaignId, issueType: d.issueType })))
  return candidates.filter((c) => {
    const det = (c.detail ?? {}) as Record<string, any>
    return !seen.has(dedupeKey({ platform: det.platform, campaignId: det.campaignId, issueType: det.issueType }))
  })
}
