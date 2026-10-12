import { queryOne } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * GET /api/agency/social/publishing/analytics/overview?clientId=
 * Top-line publishing analytics. Deep reporting lands in slice #3.
 */
export default defineEventHandler(async (event) => {
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, clientId)

  const counts = await queryOne<{ published: number; scheduled: number; failed: number; drafts: number }>(
    `SELECT
        COUNT(*) FILTER (WHERE status IN ('published','partially_published'))::int AS published,
        COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts
       FROM social_posts WHERE client_id = $1`,
    [clientId],
  )

  const metrics = await queryOne<{ impressions: number | null; engagements: number | null; clicks: number | null }>(
    `SELECT
        CASE WHEN COUNT(m.impressions) = COUNT(*) THEN SUM(m.impressions)::int ELSE NULL END AS impressions,
        CASE WHEN COUNT(m.engagements) = COUNT(*) THEN SUM(m.engagements)::int ELSE NULL END AS engagements,
        CASE WHEN COUNT(m.clicks) = COUNT(*) THEN SUM(m.clicks)::int ELSE NULL END AS clicks
       FROM social_post_metrics m
       JOIN social_posts p ON p.id = m.post_id
      WHERE p.client_id = $1`,
    [clientId],
  )

  return {
    counts: counts ?? { published: 0, scheduled: 0, failed: 0, drafts: 0 },
    metrics: metrics ?? { impressions: null, engagements: null, clicks: null },
  }
})
