import { queryRows } from '~~/server/utils/db'
import {
  buildSocialCampaignFeedbackKey,
  normalizeSocialFeedbackPlatform,
  parseSocialCampaignFeedbackSummary,
  type SocialCampaignFeedbackSummary
} from '~~/server/utils/socialInbox/campaignFeedback'

export interface CampaignFeedbackLookupInput {
  clientId?: string | null
  campaignId?: string | null
}

interface CampaignFeedbackAggregateRow {
  client_id: string
  paid_media_platform: string
  paid_media_campaign_id: string
  social_feedback_count: number | string | null
  social_negative_feedback_count: number | string | null
  social_feedback_latest_at: string | null
  social_feedback_examples: unknown
}

function uniqueClean(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(v => v?.trim()).filter((v): v is string => Boolean(v)))]
}

export async function loadSocialCampaignFeedbackLookup(
  campaigns: CampaignFeedbackLookupInput[],
  opts: { platform: string, period: string }
): Promise<Map<string, SocialCampaignFeedbackSummary>> {
  const clientIds = uniqueClean(campaigns.map(c => c.clientId))
  const campaignIds = uniqueClean(campaigns.map(c => c.campaignId))
  if (!clientIds.length || !campaignIds.length) return new Map()

  const platform = normalizeSocialFeedbackPlatform(opts.platform)
  const rows = await queryRows<CampaignFeedbackAggregateRow>(
    `SELECT
       c.client_id::text AS client_id,
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
     WHERE c.client_id = ANY($1::uuid[])
       AND c.paid_media_campaign_id = ANY($2::text[])
       AND (
         CASE
           WHEN LOWER(COALESCE(c.paid_media_platform, c.platform)) IN ('facebook', 'instagram', 'meta', 'meta_ads') THEN 'meta'
           WHEN LOWER(COALESCE(c.paid_media_platform, c.platform)) IN ('google', 'google_ads', 'google_adwords') THEN 'google_ads'
           ELSE LOWER(COALESCE(c.paid_media_platform, c.platform))
         END
       ) = $3
       AND c.last_message_at >= to_date($4, 'YYYY-MM')
       AND c.last_message_at < to_date($4, 'YYYY-MM') + INTERVAL '1 month'
     GROUP BY c.client_id, 2, c.paid_media_campaign_id`,
    [clientIds, campaignIds, platform, opts.period]
  )

  const lookup = new Map<string, SocialCampaignFeedbackSummary>()
  for (const row of rows) {
    const key = buildSocialCampaignFeedbackKey({
      clientId: row.client_id,
      platform: row.paid_media_platform,
      campaignId: row.paid_media_campaign_id
    })
    const summary = parseSocialCampaignFeedbackSummary({
      totalCount: row.social_feedback_count,
      negativeCount: row.social_negative_feedback_count,
      latestAt: row.social_feedback_latest_at,
      examples: row.social_feedback_examples
    })
    if (key && summary) lookup.set(key, summary)
  }
  return lookup
}
