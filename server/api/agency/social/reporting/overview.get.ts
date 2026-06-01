import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { buildOverview, cadenceByWeekday, rankBestContent, type PostMetricRow } from '~~/server/utils/socialReporting/aggregate'

/**
 * GET /api/agency/social/reporting/overview?clientId=&from=&to=&platform=
 * Headline organic-reporting block: KPIs with deltas vs the prior equal-length period, posting
 * cadence, top content, and account follower/reach growth. One round-trip for the dashboard hero.
 * (Engagement-ops metrics come from /api/agency/social/inbox/analytics/overview — reused by the UI.)
 */

// Per-post rows (metrics summed across the post's platforms) for posts published in [from,to).
// platform filter (optional) restricts both the post's targets and the metric rows counted.
function postRowsSql(platformFilter: boolean) {
  return `
    SELECT p.id AS post_id, MAX(m.platform) AS platform, p.published_at, p.content, p.platform_results,
           COALESCE(SUM(m.impressions),0)::int AS impressions,
           COALESCE(SUM(m.reach),0)::int AS reach,
           COALESCE(SUM(m.engagements),0)::int AS engagements,
           COALESCE(SUM(m.clicks),0)::int AS clicks,
           COALESCE(SUM(m.likes),0)::int AS likes,
           COALESCE(SUM(m.comments_count),0)::int AS comments_count,
           COALESCE(SUM(m.shares),0)::int AS shares,
           COALESCE(SUM(m.saves),0)::int AS saves,
           COALESCE(SUM(m.video_views),0)::int AS video_views,
           COALESCE(SUM(m.reactions),0)::int AS reactions
      FROM social_posts p
      LEFT JOIN social_post_metrics m ON m.post_id = p.id${platformFilter ? ' AND m.platform = $4' : ''}
     WHERE p.client_id = $1
       AND p.status IN ('published','partially_published')
       AND p.published_at >= $2 AND p.published_at < $3
       ${platformFilter ? 'AND $4 = ANY(p.platforms)' : ''}
     GROUP BY p.id`
}

function firstUrl(platformResults: any): string | null {
  if (!platformResults || typeof platformResults !== 'object') return null
  for (const v of Object.values(platformResults)) {
    const url = (v as any)?.url
    if (url) return String(url)
  }
  return null
}

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
  const span = to.getTime() - from.getTime()
  const priorFrom = new Date(from.getTime() - span)
  const platform = q.platform && q.platform !== 'all' ? String(q.platform) : null

  const sql = postRowsSql(!!platform)
  const curParams: any[] = [clientId, from.toISOString(), to.toISOString()]
  const priorParams: any[] = [clientId, priorFrom.toISOString(), from.toISOString()]
  if (platform) { curParams.push(platform); priorParams.push(platform) }

  const [current, prior, growth] = await Promise.all([
    queryRows<PostMetricRow>(sql, curParams),
    queryRows<PostMetricRow>(sql, priorParams),
    queryRows<any>(
      // Aggregate per (platform, day) so a client with >1 account on a platform yields one series point.
      `SELECT platform, snapshot_date,
              SUM(followers)::int AS followers, SUM(reach)::int AS reach, SUM(impressions)::int AS impressions
         FROM social_account_metrics
        WHERE client_id = $1 AND snapshot_date >= $2::date AND snapshot_date <= $3::date
          ${platform ? 'AND platform = $4' : ''}
        GROUP BY platform, snapshot_date
        ORDER BY snapshot_date ASC`,
      platform ? [clientId, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10), platform]
               : [clientId, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)],
    ),
  ])

  const best = rankBestContent(current, 5).map(r => ({
    postId: r.post_id, content: (r.content || '').slice(0, 140), permalink: firstUrl(r.platform_results),
    engagements: r.engagements, reach: r.reach, engagementRate: r.engagementRate,
  }))

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    kpis: buildOverview(current, prior),
    cadence: cadenceByWeekday(current),
    bestContent: best,
    accountGrowth: growth,
  }
})
