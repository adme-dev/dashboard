import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { buildPacingReview, PACING_REVIEW_SELECT_COLUMNS, type PacingReviewRow } from '~~/server/utils/socialSpendPacingReview'
import { generateGroqInsight, GROQ_MODELS, type GroqModel } from '~~/server/utils/groqClient'
import { buildAnalysisPrompt, parseAnalysisResult, buildAnalysisResponse, type AiAnalysisResult } from '~~/server/utils/spendAiAnalysis'
import { groqModelIdFromAssignment, resolveAiModelAssignment } from '~~/server/utils/ai/modelAssignments'

function requestIdFromEvent(event: any): string | null {
  const headers = event?.node?.req?.headers
  const value = headers?.['cf-ray'] ?? headers?.['x-request-id']
  if (Array.isArray(value)) return value[0] || null
  return typeof value === 'string' && value ? value : null
}

export default eventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })

  // The operator clicked Review on a specific campaign assessment. Flagged
  // campaigns can surface multiple issues, while healthy campaigns use the
  // neutral record from `campaigns` so they can still request insight.
  const body = await readBody(event).catch(() => ({})) as { issueType?: string, refresh?: boolean }
  const requestedIssue = typeof body?.issueType === 'string' ? body.issueType : null

  // Optional: re-pull this single campaign's metrics from the platform before
  // analyzing (fail-safe — falls back to synced data on any error).
  let refreshed = false
  let refreshError: string | undefined
  if (body?.refresh === true) {
    const { refreshSingleCampaignSpend } = await import('~~/server/utils/spendCampaignRefresh')
    const r = await refreshSingleCampaignSpend(id)
    refreshed = r.refreshed
    refreshError = r.error
  }

  const row = await queryOne<PacingReviewRow & { synced_at: string | null, client_id: string | null }>(
    `SELECT ${PACING_REVIEW_SELECT_COLUMNS}, ms.client_id::text AS client_id
     FROM media_spend ms
     LEFT JOIN agency_clients ac ON ac.id = ms.client_id
     WHERE ms.id = $1`,
    [id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Spend record not found' })

  const now = new Date()
  const review = buildPacingReview([row], { now, period: row.period })
  const item = (requestedIssue && review.items.find(i => i.issueType === requestedIssue))
    || (requestedIssue && review.campaigns.find(i => i.issueType === requestedIssue))
    || review.items[0]
    || review.campaigns[0]
  if (!item) throw createError({ statusCode: 422, statusMessage: 'Campaign review data is unavailable' })

  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysRemaining = Math.max(1, lastDay - now.getDate() + 1)

  const prompt = buildAnalysisPrompt({
    campaignName: item.campaignName,
    platform: item.platform,
    issueType: item.issueType,
    monthlyBudget: item.budget,
    mtdSpend: item.mtdSpend,
    currentDailyBudget: item.currentDailyBudget,
    deterministicDailyBudget: item.recommendedDailyBudget,
    pacingRatio: item.pacingRatio,
    projectedMonthEnd: item.projectedMonthEnd,
    daysRemaining,
    performance: {
      impressions: item.performance.impressions,
      clicks: item.performance.clicks,
      conversions: item.performance.conversions,
      ctr: item.performance.ctr,
      cpc: item.performance.cpc,
      costPerConversion: item.performance.costPerConversion,
    },
  })

  const assignment = await resolveAiModelAssignment({
    featureKey: 'social_spend_ai_analysis',
    defaultProvider: 'groq',
    defaultModelId: GROQ_MODELS.REASONING_120B,
    supportedProviders: ['groq'],
  })
  const modelId = groqModelIdFromAssignment(assignment.modelId) as GroqModel
  let aiResult: AiAnalysisResult = { ok: false, proposedDailyBudget: null, rationale: '', confidence: 'low', riskFlags: [] }
  try {
    const raw = await generateGroqInsight(prompt, {
      model: modelId,
      temperature: 0.2,
      maxTokens: 800,
      systemPrompt: 'You are a senior paid-media strategist. Respond ONLY with valid JSON and no prose.',
      featureKey: 'social_spend_ai_analysis',
      userId: user.id,
      clientId: row.client_id,
      requestId: requestIdFromEvent(event),
      metadata: {
        route: '/api/agency/social/spend/[id]/ai-analysis',
        modelAssignmentSource: assignment.source,
        modelAssignmentIgnoredReason: assignment.ignoredReason,
        mediaSpendId: id,
        platform: item.platform,
        issueType: item.issueType,
        refreshed,
      },
    })
    aiResult = parseAnalysisResult(raw, { currentDailyBudget: item.currentDailyBudget, monthlyBudget: item.budget })
  } catch (err: any) {
    console.warn('[ai-analysis] groq failed:', err?.message || err)
  }

  return buildAnalysisResponse({
    deterministicDaily: item.recommendedDailyBudget,
    deterministicAction: item.recommendedAction,
    ai: aiResult,
    syncedAt: row.synced_at,
    refreshed,
    refreshError,
    modelId,
  })
})
