import { queryRowsFresh } from '~~/server/utils/db'
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

  return await queryRowsFresh(
    `SELECT
        p.*,
        publisher.name AS published_by_name,
        publication.actor_id AS published_by_id,
        publication.source AS publication_source,
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
       LEFT JOIN LATERAL (
         SELECT e.actor_id, e.metadata->>'source' AS source
         FROM social_publishing_audit_events e
         WHERE e.post_id = p.id AND e.client_id = p.client_id
           AND e.action = 'post_published'
           AND e.metadata->>'status' IN ('published', 'partially_published')
         ORDER BY e.created_at ASC, e.id ASC
         LIMIT 1
       ) publication ON TRUE
       LEFT JOIN team_members publisher ON publisher.id::text = publication.actor_id
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
           AND sa.client_id = p.client_id
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
