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
  currentDailyBudget: number
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
  mode: 'read_only' | 'read_propose'
  answer: string
  findings: SpendControllerFinding[]
  recommendedActions: string[]
  proposedActions: SpendControllerProposedAction[]
  audit: {
    modelFeatureKey: 'agent_spend_controller'
    mode: 'read_only' | 'read_propose'
    toolCallCount: number
    blockedActionCount: number
  }
}

export interface SpendControllerProposedAction {
  type: 'campaign_action_plan'
  label: string
  status: 'requires_confirmation' | 'blocked'
  payloadRef?: string
  rationale: string[]
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
  mode?: 'read_only' | 'read_propose'
  proposedActions?: SpendControllerProposedAction[]
  blockedActionCount?: number
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
        input.mode === 'read_propose'
          ? 'Any drafted action remains planned and still requires approval before execution.'
          : 'This read-only review did not change budgets or campaign settings.',
      ].filter(Boolean).join(' ')
    : `No pacing issues need attention for ${input.review.period}. ${input.mode === 'read_propose' ? 'No action plans were drafted.' : 'This read-only review did not change budgets or campaign settings.'}`

  const recommendedActions = findings.length
    ? [
        'Review critical and warning pacing issues before changing budgets.',
        ...(summary.staleCount > 0 ? ['Sync stale platform data before accepting any budget recommendation.'] : []),
        'Use the existing action-plan approval flow for any budget change.',
      ]
    : ['Keep monitoring spend pacing and connection freshness.']

  return {
    mode: input.mode ?? 'read_only',
    answer,
    findings,
    recommendedActions,
    proposedActions: input.proposedActions ?? [],
    audit: {
      modelFeatureKey: 'agent_spend_controller',
      mode: input.mode ?? 'read_only',
      toolCallCount: 1,
      blockedActionCount: input.blockedActionCount ?? 0,
    },
  }
}

export function eligibleSpendControllerProposalItems(review: SpendControllerPacingInput) {
  return review.items
    .filter(item =>
      item.severity !== 'info'
      && item.issueType !== 'stale_sync'
      && item.budget > 0
      && Number.isFinite(item.recommendedDailyBudget)
      && Number.isFinite(item.currentDailyBudget)
    )
    .sort(sortFindings)
    .slice(0, 3)
}

export function normalizedSpendControllerDailyBudget(item: Pick<SpendControllerPacingItem, 'recommendedDailyBudget'>) {
  return Math.max(0, Math.round(item.recommendedDailyBudget * 100) / 100)
}
