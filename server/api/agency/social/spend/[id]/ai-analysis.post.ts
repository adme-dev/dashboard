import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { buildPacingReview, type PacingReviewRow } from '~~/server/utils/socialSpendPacingReview'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'
import { buildAnalysisPrompt, parseAnalysisResult, buildAnalysisResponse, type AiAnalysisResult } from '~~/server/utils/spendAiAnalysis'

export default eventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })

  // The operator clicked Review on a specific issue; analyze that one. A campaign
  // can surface multiple pacing issues, so match the requested type rather than
  // taking whichever item sorted first.
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

  const row = await queryOne<PacingReviewRow & { synced_at: string | null }>(
    `SELECT
       ms.id::text AS media_spend_id,
       COALESCE(ac.name, ms.campaign_name, 'Unknown') AS client_name,
       ms.platform,
       ms.campaign_id,
       ms.campaign_name,
       ms.campaign_status,
       ms.budget_allocated,
       ms.actual_spend,
       ms.impressions,
       ms.clicks,
       ms.conversions,
       ms.reach,
       ms.frequency,
       ms.impression_share,
       ms.lost_impression_share_budget,
       ms.lost_impression_share_rank,
       ms.bid_strategy,
       ms.budget_type,
       ms.period,
       ms.synced_at,
       ms.end_date
     FROM media_spend ms
     LEFT JOIN agency_clients ac ON ac.id = ms.client_id
     WHERE ms.id = $1`,
    [id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Spend record not found' })

  const now = new Date()
  const review = buildPacingReview([row], { now, period: row.period })
  const item = (requestedIssue && review.items.find(i => i.issueType === requestedIssue)) || review.items[0]
  if (!item) throw createError({ statusCode: 422, statusMessage: 'Campaign is not currently flagged for pacing review' })

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

  const modelId = GROQ_MODELS.LLAMA_70B
  let aiResult: AiAnalysisResult = { ok: false, proposedDailyBudget: null, rationale: '', confidence: 'low', riskFlags: [] }
  try {
    const raw = await generateGroqInsight(prompt, {
      model: modelId,
      temperature: 0.2,
      maxTokens: 800,
      systemPrompt: 'You are a senior paid-media strategist. Respond ONLY with valid JSON and no prose.',
    })
    aiResult = parseAnalysisResult(raw, { currentDailyBudget: item.currentDailyBudget })
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
