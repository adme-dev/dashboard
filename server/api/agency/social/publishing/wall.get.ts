import { POST_METRIC_TOTALS_SQL } from '~~/server/utils/socialReporting/metricSql'
import { queryRows } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/wall?clientId=&limit=
 * Managed post wall: one row per social_posts item with account context and
 * latest metric snapshots. This deliberately reads the publishing system of
 * record rather than inbox conversations, so it reflects everything we manage.
 */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)

  const limit = Math.min(Math.max(Number(q.limit) || 120, 1), 250)

  return await queryRows(
    `SELECT
        p.*,
        c.name AS campaign_name,
        c.color AS campaign_color,
        COALESCE(accounts.accounts, '[]'::jsonb) AS accounts,
        jsonb_build_object(
          'conversation_count', COALESCE(engagement.conversation_count, 0),
          'open_count', COALESCE(engagement.open_count, 0),
          'unread_count', COALESCE(engagement.unread_count, 0),
          'message_count', COALESCE(engagement.message_count, 0),
          'latest_activity_at', engagement.latest_activity_at
        ) AS engagement,
        jsonb_build_object(
          'impressions', metrics.impressions,
          'engagements', metrics.engagements,
          'clicks', metrics.clicks,
          'reach', metrics.reach,
          'likes', metrics.likes,
          'comments_count', metrics.comments_count,
          'shares', metrics.shares,
          'saves', metrics.saves,
          'video_views', metrics.video_views,
          'reactions', metrics.reactions
        ) AS metrics,
        COALESCE(metrics.by_platform, '{}'::jsonb) AS metrics_by_platform
       FROM social_posts p
       LEFT JOIN social_campaigns c ON c.id = p.campaign_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
           jsonb_build_object(
             'id', sa.id,
             'platform', sa.platform,
             'account_name', sa.account_name,
             'platform_account_id', sa.platform_account_id
           )
           ORDER BY sa.platform, sa.account_name NULLS LAST, sa.platform_account_id
         ) AS accounts
         FROM social_accounts sa
         WHERE p.account_ids IS NOT NULL
           AND sa.id = ANY(p.account_ids)
       ) accounts ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS conversation_count,
           COUNT(*) FILTER (WHERE c.status = 'open')::int AS open_count,
           COALESCE(SUM(c.unread_count), 0)::int AS unread_count,
           COALESCE(SUM(c.message_count), 0)::int AS message_count,
           MAX(c.last_message_at)::text AS latest_activity_at
         FROM social_conversations c
         WHERE c.linked_social_post_id = p.id
       ) engagement ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           ${POST_METRIC_TOTALS_SQL},
           jsonb_object_agg(
             m.platform,
             jsonb_build_object(
               'impressions', m.impressions,
               'engagements', m.engagements,
               'clicks', m.clicks,
               'reach', m.reach,
               'likes', m.likes,
               'comments_count', m.comments_count,
               'shares', m.shares,
               'saves', m.saves,
               'video_views', m.video_views,
               'reactions', m.reactions
             )
           ) FILTER (WHERE m.platform IS NOT NULL) AS by_platform
         FROM social_post_metrics m
         WHERE m.post_id = p.id
       ) metrics ON TRUE
      WHERE p.client_id = $1
      ORDER BY COALESCE(p.published_at, p.scheduled_at, p.updated_at, p.created_at) DESC
      LIMIT $2`,
    [clientId, limit]
  )
})
