import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import {
  buildPacingReview,
  type PacingReviewRow,
  type PacingReviewResult,
} from '~~/server/utils/socialSpendPacingReview'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'

function platformFilter(raw: unknown): 'meta' | 'google_ads' | null {
  const value = String(raw || '')
  if (value === 'meta') return 'meta'
  if (value === 'google' || value === 'google_ads') return 'google_ads'
  return null
}

function buildAiPrompt(review: PacingReviewResult): string {
  const items = review.items.slice(0, 12).map(item => ({
    client: item.clientName,
    platform: item.platform,
    campaign: item.campaignName,
    issue: item.issueType,
    severity: item.severity,
    budget: item.budget,
    spend: item.mtdSpend,
    expectedToDate: item.expectedToDate,
    projectedMonthEnd: item.projectedMonthEnd,
    recommendedDailyBudget: item.recommendedDailyBudget,
    action: item.recommendedAction,
  }))
  return JSON.stringify({ period: review.period, summary: review.summary, items }, null, 2)
}

async function generateAiSummary(review: PacingReviewResult): Promise<string | null> {
  if (review.items.length === 0) return null
  try {
    const raw = await generateGroqInsight(buildAiPrompt(review), {
      model: GROQ_MODELS.LLAMA_8B,
      temperature: 0.1,
      maxTokens: 220,
      systemPrompt: [
        'You are an agency paid-media pacing analyst.',
        'Summarize only the JSON numbers provided.',
        'Keep it under 90 words.',
        'Prioritize what the media buyer should review first.',
        'Do not claim any changes were made.',
      ].join(' '),
    })
    return raw.trim() || null
  } catch (err: any) {
    console.warn('[pacing-review] AI summary failed:', err?.message || err)
    return null
  }
}

export default eventHandler(async (event) => {
  await requireAuth(event)

  const q = getQuery(event)
  const now = new Date()
  const month = parseInt(String(q.month || now.getMonth() + 1), 10)
  const year = parseInt(String(q.year || now.getFullYear()), 10)
  const period = `${year}-${String(month).padStart(2, '0')}`
  const selectedPlatform = platformFilter(q.platform)

  const params: any[] = [period]
  let where = `WHERE ms.period = $1 AND ms.platform IN ('meta', 'google_ads')`
  if (selectedPlatform) {
    params.push(selectedPlatform)
    where += ` AND ms.platform = $${params.length}`
  }

  const rows = await queryRows<PacingReviewRow>(
    `SELECT
       ms.id::text AS media_spend_id,
       COALESCE(ac.name, ms.campaign_name, 'Unknown') AS client_name,
       ms.platform,
       ms.campaign_id,
       ms.campaign_name,
       ms.campaign_status,
       ms.budget_allocated,
       ms.actual_spend,
       ms.conversions,
       ms.period,
       ms.synced_at,
       ms.end_date
     FROM media_spend ms
     LEFT JOIN agency_clients ac ON ac.id = ms.client_id
     ${where}
     ORDER BY ms.actual_spend DESC`,
    params,
  )

  const review = buildPacingReview(rows, { now, period })
  const includeAi = q.ai !== '0' && q.ai !== 'false'
  const aiSummary = includeAi ? await generateAiSummary(review) : null

  return { ...review, aiSummary }
})
