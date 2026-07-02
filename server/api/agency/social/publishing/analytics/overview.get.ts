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

  const metrics = await queryOne<{ impressions: number; engagements: number; clicks: number }>(
    `SELECT
        COALESCE(SUM(m.impressions),0)::int AS impressions,
        COALESCE(SUM(m.engagements),0)::int AS engagements,
        COALESCE(SUM(m.clicks),0)::int AS clicks
       FROM social_post_metrics m
       JOIN social_posts p ON p.id = m.post_id
      WHERE p.client_id = $1`,
    [clientId],
  )

  return {
    counts: counts ?? { published: 0, scheduled: 0, failed: 0, drafts: 0 },
    metrics: metrics ?? { impressions: 0, engagements: 0, clicks: 0 },
  }
})
