import { queryOne, queryRows } from '~~/server/utils/db'
import { recordCampaignAction } from '~~/server/utils/campaignActionLog'
import {
  buildPacingReview,
  PACING_REVIEW_SELECT_COLUMNS,
  type PacingReviewRow,
} from '~~/server/utils/socialSpendPacingReview'
import {
  createSpendControllerReadOnlyResponse,
  eligibleSpendControllerProposalItems,
  normalizedSpendControllerDailyBudget,
  type SpendControllerProposedAction,
} from '~~/server/utils/ai/spendControllerAgent'
import {
  completePlatformAgentRun,
  failPlatformAgentRun,
  startPlatformAgentRun,
} from '~~/server/utils/ai/platformAgentRuns'

export interface SpendControllerAgentRuntimeInput {
  prompt: string
  context?: Record<string, unknown>
  draftActions?: boolean
  userId?: string | null
  route?: string
}

function platformFilter(raw: unknown): 'meta' | 'google_ads' | null {
  const value = String(raw || '')
  if (value === 'meta') return 'meta'
  if (value === 'google' || value === 'google_ads') return 'google_ads'
  return null
}

function requestedPeriod(raw: unknown) {
  if (typeof raw === 'string' && /^\d{4}-\d{2}$/.test(raw)) return raw
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export async function runSpendControllerAgentRequest(input: SpendControllerAgentRuntimeInput) {
  const prompt = input.prompt.trim()
  const context = input.context && typeof input.context === 'object' ? input.context : {}
  const period = requestedPeriod(context.period)
  const selectedPlatform = platformFilter(context.platform)
  const startedAtMs = Date.now()
  const run = await startPlatformAgentRun({
    agentType: 'spend_controller',
    featureKey: 'agent_spend_controller',
    mode: input.draftActions ? 'read_propose' : 'read_only',
    userId: input.userId ?? null,
    clientId: typeof context.clientId === 'string' ? context.clientId : null,
    route: input.route ?? '/agency/social/spend',
    prompt,
    context: {
      period,
      platform: selectedPlatform ?? 'all',
    },
  })

  try {
    const params: any[] = [period]
    let where = `WHERE ms.period = $1 AND ms.platform IN ('meta', 'google_ads')`
    if (selectedPlatform) {
      params.push(selectedPlatform)
      where += ` AND ms.platform = $${params.length}`
    }

    const rows = await queryRows<PacingReviewRow>(
      `SELECT ${PACING_REVIEW_SELECT_COLUMNS}
       FROM media_spend ms
       LEFT JOIN agency_clients ac ON ac.id = ms.client_id
       ${where}
       ORDER BY ms.actual_spend DESC
       LIMIT 100`,
      params,
    )
    const review = buildPacingReview(rows, { now: new Date(), period })
    const proposedActions = input.draftActions
      ? await draftSpendControllerActions(review, input.userId ?? null)
      : []
    const response = createSpendControllerReadOnlyResponse({
      prompt,
      review,
      mode: input.draftActions ? 'read_propose' : 'read_only',
      proposedActions,
    })
    const runId = run.ok ? run.runId : null

    if (run.ok) {
      await completePlatformAgentRun({
        runId: run.runId,
        startedAtMs,
        toolCallCount: response.audit.toolCallCount,
        findingCount: response.findings.length,
        proposedActionCount: response.proposedActions.length,
        blockedActionCount: response.audit.blockedActionCount,
        summary: {
          answerPreview: response.answer.slice(0, 240),
          period,
          platform: selectedPlatform ?? 'all',
        },
      })
    }

    return {
      runId,
      ...response,
      audit: {
        ...response.audit,
        runLoggingAvailable: run.ok,
      },
    }
  } catch (error) {
    if (run.ok) {
      await failPlatformAgentRun({
        runId: run.runId,
        startedAtMs,
        error,
        toolCallCount: 1,
        findingCount: 0,
      })
    }
    throw error
  }
}

async function draftSpendControllerActions(review: ReturnType<typeof buildPacingReview>, userId: string | null): Promise<SpendControllerProposedAction[]> {
  const proposals: SpendControllerProposedAction[] = []
  for (const item of eligibleSpendControllerProposalItems(review)) {
    const recommendedDailyBudget = normalizedSpendControllerDailyBudget(item)
    const existing = await queryOne<{ id: string, action_status: string }>(
      `SELECT id::text, action_status
       FROM campaign_action_log
       WHERE media_spend_id = $1
         AND action_type = 'budget_update'
         AND action_status IN ('planned', 'approved')
         AND metadata->>'source' = 'spend_controller_agent'
         AND (new_value->>'dailyBudget')::numeric = $2
       ORDER BY CASE WHEN action_status = 'approved' THEN 0 ELSE 1 END,
                requested_at DESC
       LIMIT 1`,
      [item.mediaSpendId, recommendedDailyBudget]
    )
    if (existing) {
      proposals.push({
        type: 'campaign_action_plan',
        label: `${item.campaignName}: planned budget action already exists`,
        status: 'requires_confirmation',
        payloadRef: existing.id,
        rationale: [
          'A matching planned or approved action already exists.',
          item.recommendedAction,
        ],
      })
      continue
    }

    const action = await recordCampaignAction({
      mediaSpendId: item.mediaSpendId,
      platform: item.platform === 'google' ? 'google_ads' : 'meta',
      actionType: 'budget_update',
      actionStatus: 'planned',
      requestedBy: userId,
      previousValue: { dailyBudget: item.currentDailyBudget },
      newValue: { dailyBudget: recommendedDailyBudget },
      reason: item.recommendedAction,
      metadata: {
        source: 'spend_controller_agent',
        issueType: item.issueType,
        pacingRatio: item.pacingRatio,
        projectedMonthEnd: item.projectedMonthEnd,
        monthlyBudget: item.budget,
        campaignName: item.campaignName,
      },
    })

    proposals.push({
      type: 'campaign_action_plan',
      label: `${item.campaignName}: draft daily budget ${recommendedDailyBudget}`,
      status: 'requires_confirmation',
      payloadRef: action.id,
      rationale: [
        item.recommendedAction,
        'Drafted as a planned action only. Approval and execution remain separate.',
      ],
    })
  }
  return proposals
}
