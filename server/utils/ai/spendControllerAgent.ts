import type { PacingReviewIssueType, PacingReviewSeverity } from '~~/server/utils/socialSpendPacingReview'

export interface SpendControllerPacingItem {
  mediaSpendId: string
  clientName: string
  platform: string
  campaignId: string | null
  campaignName: string
  issueType: PacingReviewIssueType
  severity: PacingReviewSeverity
  budget: number
  mtdSpend: number
  expectedToDate: number
  projectedMonthEnd: number
  recommendedDailyBudget: number
  syncedAt: string | null
  recommendedAction: string
}

export interface SpendControllerPacingInput {
  period: string
  generatedAt: string
  summary: {
    criticalCount: number
    warningCount: number
    infoCount: number
    staleCount: number
    projectedOverspend: number
    projectedUnderspend: number
  }
  items: SpendControllerPacingItem[]
}

export interface SpendControllerFinding {
  severity: PacingReviewSeverity
  title: string
  detail: string
  featureKey: 'agent_spend_controller'
  sourceRefs: Array<{ type: string, id?: string, label: string }>
}

export interface SpendControllerResponse {
  mode: 'read_only'
  answer: string
  findings: SpendControllerFinding[]
  recommendedActions: string[]
  proposedActions: []
  audit: {
    modelFeatureKey: 'agent_spend_controller'
    mode: 'read_only'
    toolCallCount: number
    blockedActionCount: number
  }
}

const ISSUE_LABELS: Record<PacingReviewIssueType, string> = {
  overpacing: 'overpacing',
  underpacing: 'underpacing',
  no_spend: 'not spending',
  paused_with_budget: 'paused with budget',
  stale_sync: 'using stale spend data',
  zero_conversion: 'spending with zero conversions',
}

function money(value: number) {
  return `$${Math.round(value).toLocaleString()}`
}

function findingDetail(item: SpendControllerPacingItem) {
  const projectedDelta = item.projectedMonthEnd - item.budget
  const deltaText = projectedDelta >= 0
    ? `${money(projectedDelta)} over budget at projected month-end`
    : `${money(Math.abs(projectedDelta))} under budget at projected month-end`
  return [
    `${item.platform} campaign has ${money(item.mtdSpend)} month-to-date spend against a ${money(item.budget)} budget.`,
    `${deltaText}.`,
    item.recommendedAction,
  ].join(' ')
}

function sortFindings(a: SpendControllerPacingItem, b: SpendControllerPacingItem) {
  const severityRank: Record<PacingReviewSeverity, number> = { critical: 0, warning: 1, info: 2 }
  return severityRank[a.severity] - severityRank[b.severity]
    || Math.abs(b.projectedMonthEnd - b.budget) - Math.abs(a.projectedMonthEnd - a.budget)
}

export function createSpendControllerReadOnlyResponse(input: {
  prompt: string
  review: SpendControllerPacingInput
}): SpendControllerResponse {
  const items = [...input.review.items].sort(sortFindings)
  const findings = items.slice(0, 8).map<SpendControllerFinding>((item) => ({
    severity: item.severity,
    title: `${item.clientName} / ${item.campaignName} is ${ISSUE_LABELS[item.issueType]}`,
    detail: findingDetail(item),
    featureKey: 'agent_spend_controller',
    sourceRefs: [
      {
        type: 'media_spend',
        id: item.mediaSpendId,
        label: item.campaignName,
      },
    ],
  }))

  const { summary } = input.review
  const answer = findings.length
    ? [
        `I found ${summary.criticalCount} critical and ${summary.warningCount} warning spend pacing issue${summary.criticalCount + summary.warningCount === 1 ? '' : 's'} for ${input.review.period}.`,
        summary.projectedOverspend > 0 ? `Projected overspend is ${money(summary.projectedOverspend)}.` : '',
        summary.projectedUnderspend > 0 ? `Projected underspend is ${money(summary.projectedUnderspend)}.` : '',
        'This read-only review did not change budgets or campaign settings.',
      ].filter(Boolean).join(' ')
    : `No pacing issues need attention for ${input.review.period}. This read-only review did not change budgets or campaign settings.`

  const recommendedActions = findings.length
    ? [
        'Review critical and warning pacing issues before changing budgets.',
        ...(summary.staleCount > 0 ? ['Sync stale platform data before accepting any budget recommendation.'] : []),
        'Use the existing action-plan approval flow for any budget change.',
      ]
    : ['Keep monitoring spend pacing and connection freshness.']

  return {
    mode: 'read_only',
    answer,
    findings,
    recommendedActions,
    proposedActions: [],
    audit: {
      modelFeatureKey: 'agent_spend_controller',
      mode: 'read_only',
      toolCallCount: 1,
      blockedActionCount: 0,
    },
  }
}
