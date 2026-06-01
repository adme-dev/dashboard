// server/utils/socialReporting/portal.ts
// Client-portal reporting data layer (Slice 3 / 3b-2). Client-facing, so the cardinal rule is
// TENANT ISOLATION: every query is scoped to the session client_id the endpoint passes (derived
// from requireClientAuth — NEVER caller input). Mirrors socialInbox/portal.ts. Returns the same
// per-post row shape the agency dashboard uses, so the pure aggregate.ts functions apply unchanged.
import type { PostMetricRow } from '~~/server/utils/socialReporting/aggregate'

export interface PortalReportDb {
  queryRows<T = any>(sql: string, params?: any[]): Promise<T[]>
}

/** Per-post rows (metrics summed across the post's platforms) for posts published in [fromISO, toISO). */
export async function portalPeriodPostRows(
  db: PortalReportDb, clientId: string, fromISO: string, toISO: string, platform: string | null,
): Promise<PostMetricRow[]> {
  const params: any[] = [clientId, fromISO, toISO]
  if (platform) params.push(platform)
  return db.queryRows<PostMetricRow>(
    `SELECT p.id AS post_id, MAX(m.platform) AS platform, p.published_at, p.content, p.platform_results,
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
       LEFT JOIN social_post_metrics m ON m.post_id = p.id${platform ? ' AND m.platform = $4' : ''}
      WHERE p.client_id = $1
        AND p.status IN ('published','partially_published')
        AND p.published_at >= $2 AND p.published_at < $3
        ${platform ? 'AND $4 = ANY(p.platforms)' : ''}
      GROUP BY p.id`,
    params,
  )
}

/** Per-(platform, day) account growth series within the date window, scoped to the client. */
export async function portalAccountGrowth(
  db: PortalReportDb, clientId: string, fromDate: string, toDate: string, platform: string | null,
): Promise<any[]> {
  const params: any[] = [clientId, fromDate, toDate]
  if (platform) params.push(platform)
  return db.queryRows(
    `SELECT platform, snapshot_date,
            SUM(followers)::int AS followers, SUM(reach)::int AS reach, SUM(impressions)::int AS impressions
       FROM social_account_metrics
      WHERE client_id = $1 AND snapshot_date >= $2::date AND snapshot_date <= $3::date
        ${platform ? 'AND platform = $4' : ''}
      GROUP BY platform, snapshot_date
      ORDER BY snapshot_date ASC`,
    params,
  )
}
