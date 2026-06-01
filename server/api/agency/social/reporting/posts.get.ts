import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/agency/social/reporting/posts?clientId=&from=&to=&platform=&sort=&limit=
 * Per-post performance table (metrics summed across the post's platforms), sortable by a metric.
 */
const SORTABLE = new Set(['engagements', 'impressions', 'reach', 'clicks', 'likes', 'comments_count', 'shares', 'saves', 'published_at'])

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const to = q.to ? new Date(String(q.to)) : new Date()
  const from = q.from ? new Date(String(q.from)) : new Date(to.getTime() - 30 * 86400_000)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw createError({ statusCode: 400, statusMessage: 'invalid from/to range' })
  }
  const platform = q.platform && q.platform !== 'all' ? String(q.platform) : null
  const sort = SORTABLE.has(String(q.sort)) ? String(q.sort) : 'engagements' // whitelisted → safe to interpolate
  const limit = Math.min(Number(q.limit) || 100, 500)

  const params: any[] = [clientId, from.toISOString(), to.toISOString()]
  if (platform) params.push(platform)
  params.push(limit)

  const rows = await queryRows<any>(
    `SELECT p.id AS post_id, p.published_at, p.content, p.platforms, p.platform_results,
            COALESCE(SUM(m.impressions),0)::int AS impressions,
            COALESCE(SUM(m.reach),0)::int AS reach,
            COALESCE(SUM(m.engagements),0)::int AS engagements,
            COALESCE(SUM(m.clicks),0)::int AS clicks,
            COALESCE(SUM(m.likes),0)::int AS likes,
            COALESCE(SUM(m.comments_count),0)::int AS comments_count,
            COALESCE(SUM(m.shares),0)::int AS shares,
            COALESCE(SUM(m.saves),0)::int AS saves,
            COALESCE(SUM(m.video_views),0)::int AS video_views
       FROM social_posts p
       LEFT JOIN social_post_metrics m ON m.post_id = p.id${platform ? ' AND m.platform = $4' : ''}
      WHERE p.client_id = $1
        AND p.status IN ('published','partially_published')
        AND p.published_at >= $2 AND p.published_at < $3
        ${platform ? 'AND $4 = ANY(p.platforms)' : ''}
      GROUP BY p.id
      ORDER BY ${sort === 'published_at' ? 'p.published_at' : sort} DESC NULLS LAST
      LIMIT $${params.length}`,
    params,
  )
  return rows
})
