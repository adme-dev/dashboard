import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/agency/social/publishing/wall?clientId=&limit=
 * Managed post wall: one row per social_posts item with account context and
 * latest metric snapshots. This deliberately reads the publishing system of
 * record rather than inbox conversations, so it reflects everything we manage.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const limit = Math.min(Math.max(Number(q.limit) || 120, 1), 250)

  return await queryRows(
    `SELECT
        p.*,
        c.name AS campaign_name,
        c.color AS campaign_color,
        COALESCE(accounts.accounts, '[]'::jsonb) AS accounts,
        jsonb_build_object(
          'impressions', COALESCE(metrics.impressions, 0),
          'engagements', COALESCE(metrics.engagements, 0),
          'clicks', COALESCE(metrics.clicks, 0),
          'reach', COALESCE(metrics.reach, 0),
          'likes', COALESCE(metrics.likes, 0),
          'comments_count', COALESCE(metrics.comments_count, 0),
          'shares', COALESCE(metrics.shares, 0),
          'saves', COALESCE(metrics.saves, 0),
          'video_views', COALESCE(metrics.video_views, 0),
          'reactions', COALESCE(metrics.reactions, 0)
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
           COALESCE(SUM(m.impressions), 0)::int AS impressions,
           COALESCE(SUM(m.engagements), 0)::int AS engagements,
           COALESCE(SUM(m.clicks), 0)::int AS clicks,
           COALESCE(SUM(m.reach), 0)::int AS reach,
           COALESCE(SUM(m.likes), 0)::int AS likes,
           COALESCE(SUM(m.comments_count), 0)::int AS comments_count,
           COALESCE(SUM(m.shares), 0)::int AS shares,
           COALESCE(SUM(m.saves), 0)::int AS saves,
           COALESCE(SUM(m.video_views), 0)::int AS video_views,
           COALESCE(SUM(m.reactions), 0)::int AS reactions,
           jsonb_object_agg(
             m.platform,
             jsonb_build_object(
               'impressions', COALESCE(m.impressions, 0),
               'engagements', COALESCE(m.engagements, 0),
               'clicks', COALESCE(m.clicks, 0),
               'reach', COALESCE(m.reach, 0),
               'likes', COALESCE(m.likes, 0),
               'comments_count', COALESCE(m.comments_count, 0),
               'shares', COALESCE(m.shares, 0),
               'saves', COALESCE(m.saves, 0),
               'video_views', COALESCE(m.video_views, 0),
               'reactions', COALESCE(m.reactions, 0)
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
