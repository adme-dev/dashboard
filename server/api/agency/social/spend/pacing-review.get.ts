import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import {
  buildPacingReview,
  PACING_REVIEW_SELECT_COLUMNS,
  type PacingReviewRow,
  type PacingReviewResult
} from '~~/server/utils/socialSpendPacingReview'
import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'

interface RequestHeaderEvent {
  node?: {
    req?: {
      headers?: Record<string, string | string[] | undefined>
    }
  }
}

function requestIdFromEvent(event: RequestHeaderEvent): string | null {
  const headers = event?.node?.req?.headers
  const value = headers?.['cf-ray'] ?? headers?.['x-request-id']
  if (Array.isArray(value)) return value[0] || null
  return typeof value === 'string' && value ? value : null
}

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
    dailyBudgetActionSupported: item.dailyBudgetActionSupported,
    action: item.recommendedAction
  }))
  return JSON.stringify({ period: review.period, summary: review.summary, items }, null, 2)
}

async function generateAiSummary(review: PacingReviewResult, context: {
  userId: string
  requestId: string | null
  metadata: Record<string, unknown>
}): Promise<string | null> {
  if (review.items.length === 0) return null
  try {
    const raw = await generateModelRoutedGroqInsight(buildAiPrompt(review), {
      defaultModelId: GROQ_MODELS.LLAMA_8B,
      temperature: 0.1,
      maxTokens: 220,
      systemPrompt: [
        'You are an agency paid-media pacing analyst.',
        'Summarize only the JSON numbers provided.',
        'Keep it under 90 words.',
        'Prioritize what the media buyer should review first.',
        'Do not claim any changes were made.'
      ].join(' '),
      featureKey: 'social_spend_pacing_summary',
      userId: context.userId,
      requestId: context.requestId,
      metadata: context.metadata
    })
    return raw.trim() || null
  } catch (err: unknown) {
    console.warn('[pacing-review] AI summary failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export default eventHandler(async (event) => {
  const user = await requireAuth(event)

  const q = getQuery(event)
  const now = new Date()
  const month = parseInt(String(q.month || now.getMonth() + 1), 10)
  const year = parseInt(String(q.year || now.getFullYear()), 10)
  const period = `${year}-${String(month).padStart(2, '0')}`
  const selectedPlatform = platformFilter(q.platform)

  const params: unknown[] = [period]
  let where = `WHERE ms.period = $1 AND ms.platform IN ('meta', 'google_ads')`
  if (selectedPlatform) {
    params.push(selectedPlatform)
    where += ` AND ms.platform = $${params.length}`
  }

  const rows = await queryRows<PacingReviewRow>(
    `WITH social_campaign_feedback AS (
       SELECT
         c.client_id,
         CASE
           WHEN LOWER(COALESCE(c.paid_media_platform, c.platform)) IN ('facebook', 'instagram', 'meta', 'meta_ads') THEN 'meta'
           WHEN LOWER(COALESCE(c.paid_media_platform, c.platform)) IN ('google', 'google_ads', 'google_adwords') THEN 'google_ads'
           ELSE LOWER(COALESCE(c.paid_media_platform, c.platform))
         END AS paid_media_platform,
         c.paid_media_campaign_id,
         COUNT(*)::int AS social_feedback_count,
         COUNT(*) FILTER (
           WHERE COALESCE(c.sentiment, 0) < 0 OR COALESCE(c.rating, 5) <= 2
         )::int AS social_negative_feedback_count,
         MAX(c.last_message_at)::text AS social_feedback_latest_at,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'conversationId', c.id::text,
               'channelType', c.channel_type,
               'preview', c.last_message_preview,
               'permalink', c.permalink,
               'sentiment', c.sentiment,
               'rating', c.rating,
               'lastMessageAt', c.last_message_at
             )
             ORDER BY c.last_message_at DESC NULLS LAST
           ) FILTER (
             WHERE COALESCE(c.sentiment, 0) < 0 OR COALESCE(c.rating, 5) <= 2
           ),
           '[]'::jsonb
         ) AS social_feedback_examples
       FROM social_conversations c
       WHERE c.paid_media_campaign_id IS NOT NULL
         AND c.last_message_at >= to_date($1, 'YYYY-MM')
         AND c.last_message_at < to_date($1, 'YYYY-MM') + INTERVAL '1 month'
       GROUP BY c.client_id, 2, c.paid_media_campaign_id
     )
     SELECT ${PACING_REVIEW_SELECT_COLUMNS},
       COALESCE(scf.social_feedback_count, 0)::int AS social_feedback_count,
       COALESCE(scf.social_negative_feedback_count, 0)::int AS social_negative_feedback_count,
       scf.social_feedback_latest_at,
       COALESCE(scf.social_feedback_examples, '[]'::jsonb) AS social_feedback_examples
     FROM media_spend ms
     LEFT JOIN agency_clients ac ON ac.id = ms.client_id
     LEFT JOIN social_campaign_feedback scf
       ON scf.client_id = ms.client_id
      AND scf.paid_media_platform = ms.platform
      AND scf.paid_media_campaign_id = ms.campaign_id
     ${where}
     ORDER BY ms.actual_spend DESC`,
    params
  )

  const review = buildPacingReview(rows, { now, period })
  const includeAi = q.ai !== '0' && q.ai !== 'false'
  const aiSummary = includeAi
    ? await generateAiSummary(review, {
        userId: user.id,
        requestId: requestIdFromEvent(event),
        metadata: {
          route: '/api/agency/social/spend/pacing-review',
          period,
          platform: selectedPlatform ?? 'all'
        }
      })
    : null

  return { ...review, aiSummary }
})
