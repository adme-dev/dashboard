import { queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { buildClientCondition, toNum } from '~~/server/utils/analyticsMetrics'

interface RefreshOverviewRow {
  platform: string
  campaign_count: string
  spend: string
  impressions: string
  clicks: string
  conversions: string
  revenue: string
  first_source_sync_at: string | null
  last_source_sync_at: string | null
  last_detail_success_at: string | null
  refreshing_count: string
  failed_count: string
  latest_snapshot_at: string | null
  latest_snapshot_spend: string | null
  previous_snapshot_spend: string | null
  latest_snapshot_clicks: string | null
  previous_snapshot_clicks: string | null
  latest_snapshot_conversions: string | null
  previous_snapshot_conversions: string | null
  comparison_count: string
}

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  if (!clientUser.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }

  const q = getQuery(event)
  const startDate = String(q.startDate || '')
  const endDate = String(q.endDate || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid startDate and endDate are required' })
  }

  const platforms = String(q.platform || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  const params: unknown[] = [startDate.slice(0, 7), endDate.slice(0, 7), clientUser.clientId]
  const conditions = ['ms.period >= $1', 'ms.period <= $2', buildClientCondition(3)]
  if (platforms.length > 0) {
    params.push(platforms)
    conditions.push(`ms.platform = ANY($4::text[])`)
  }

  const rows = await queryRows<RefreshOverviewRow>(`
    WITH scoped AS (
      SELECT ms.*
      FROM media_spend ms
      WHERE ${conditions.join(' AND ')}
    ),
    current_agg AS (
      SELECT
        platform,
        COUNT(DISTINCT COALESCE(campaign_id, id::text)) AS campaign_count,
        COALESCE(SUM(actual_spend), 0) AS spend,
        COALESCE(SUM(impressions), 0) AS impressions,
        COALESCE(SUM(clicks), 0) AS clicks,
        COALESCE(SUM(conversions), 0) AS conversions,
        COALESCE(SUM(revenue), 0) AS revenue,
        MIN(synced_at) AS first_source_sync_at,
        MAX(synced_at) AS last_source_sync_at
      FROM scoped
      GROUP BY platform
    ),
    latest_campaigns AS (
      SELECT DISTINCT ON (platform, COALESCE(campaign_id, id::text))
        id,
        platform
      FROM scoped
      ORDER BY platform, COALESCE(campaign_id, id::text), synced_at DESC NULLS LAST, period DESC
    ),
    state_agg AS (
      SELECT
        lc.platform,
        MAX(rs.last_success_at) AS last_detail_success_at,
        COUNT(*) FILTER (
          WHERE rs.status = 'refreshing' AND rs.lease_until > NOW()
        ) AS refreshing_count,
        COUNT(*) FILTER (WHERE rs.status = 'failed') AS failed_count
      FROM latest_campaigns lc
      LEFT JOIN campaign_detail_refresh_state rs ON rs.media_spend_id = lc.id
      GROUP BY lc.platform
    ),
    ranked_snapshots AS (
      SELECT
        lc.platform,
        cms.media_spend_id,
        cms.spend,
        cms.clicks,
        cms.conversions,
        cms.captured_at,
        ROW_NUMBER() OVER (
          PARTITION BY cms.media_spend_id
          ORDER BY cms.captured_at DESC
        ) AS snapshot_rank
      FROM latest_campaigns lc
      JOIN campaign_metric_snapshots cms ON cms.media_spend_id = lc.id
    ),
    snapshot_agg AS (
      SELECT
        platform,
        MAX(captured_at) FILTER (WHERE snapshot_rank = 1) AS latest_snapshot_at,
        SUM(spend) FILTER (WHERE snapshot_rank = 1) AS latest_snapshot_spend,
        SUM(spend) FILTER (WHERE snapshot_rank = 2) AS previous_snapshot_spend,
        SUM(clicks) FILTER (WHERE snapshot_rank = 1) AS latest_snapshot_clicks,
        SUM(clicks) FILTER (WHERE snapshot_rank = 2) AS previous_snapshot_clicks,
        SUM(conversions) FILTER (WHERE snapshot_rank = 1) AS latest_snapshot_conversions,
        SUM(conversions) FILTER (WHERE snapshot_rank = 2) AS previous_snapshot_conversions,
        COUNT(DISTINCT media_spend_id) FILTER (WHERE snapshot_rank = 2) AS comparison_count
      FROM ranked_snapshots
      WHERE snapshot_rank <= 2
      GROUP BY platform
    )
    SELECT
      ca.*,
      sa.last_detail_success_at,
      COALESCE(sa.refreshing_count, 0) AS refreshing_count,
      COALESCE(sa.failed_count, 0) AS failed_count,
      snap.latest_snapshot_at,
      snap.latest_snapshot_spend,
      snap.previous_snapshot_spend,
      snap.latest_snapshot_clicks,
      snap.previous_snapshot_clicks,
      snap.latest_snapshot_conversions,
      snap.previous_snapshot_conversions,
      COALESCE(snap.comparison_count, 0) AS comparison_count
    FROM current_agg ca
    LEFT JOIN state_agg sa ON sa.platform = ca.platform
    LEFT JOIN snapshot_agg snap ON snap.platform = ca.platform
    ORDER BY ca.spend DESC
  `, params)

  return {
    generatedAt: new Date().toISOString(),
    sources: rows.map(row => {
      const comparisonCount = Number(row.comparison_count || 0)
      const delta = comparisonCount > 0
        ? {
            spend: toNum(row.latest_snapshot_spend) - toNum(row.previous_snapshot_spend),
            clicks: toNum(row.latest_snapshot_clicks) - toNum(row.previous_snapshot_clicks),
            conversions: toNum(row.latest_snapshot_conversions) - toNum(row.previous_snapshot_conversions),
            campaignCoverage: comparisonCount,
          }
        : null

      return {
        platform: row.platform,
        campaignCount: Number(row.campaign_count || 0),
        spend: toNum(row.spend),
        impressions: toNum(row.impressions),
        clicks: toNum(row.clicks),
        conversions: toNum(row.conversions),
        revenue: toNum(row.revenue),
        firstSourceSyncAt: row.first_source_sync_at,
        lastSourceSyncAt: row.last_source_sync_at,
        lastDetailSuccessAt: row.last_detail_success_at,
        refreshingCount: Number(row.refreshing_count || 0),
        failedCount: Number(row.failed_count || 0),
        latestSnapshotAt: row.latest_snapshot_at,
        delta,
      }
    }),
  }
})
