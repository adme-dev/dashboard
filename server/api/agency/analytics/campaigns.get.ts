/**
 * Analytics Campaigns
 * GET /api/agency/analytics/campaigns
 *
 * Query params: startDate, endDate, clientId?, platform? (comma-separated),
 *               sortBy, sortDir, limit (default 50), offset (default 0), search?
 */
import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { computeMetrics, toNum, toDateOnly, ANALYTICS_PLATFORM_LABELS, PLATFORM_COLORS, buildClientCondition } from '~~/server/utils/analyticsMetrics'
import { buildCampaignDeepLink } from '~~/server/utils/platformDeepLinks'
import {
  PORTAL_LEAD_STATUS_SELECT,
  leadSourceForPlatformSql
} from '~~/server/utils/leads/portalAnalytics'
import { scoreCampaignHealth } from '~~/server/utils/campaignHealth'
import { buildCampaignBudgetIdentity, normalizeBudgetPlatform } from '~~/server/utils/campaignBudgetIdentity'

const ALLOWED_SORT = ['spend', 'budget', 'impressions', 'clicks', 'conversions', 'revenue', 'campaign_name', 'platform', 'lead_count', 'cost_per_lead', 'reach', 'cost_per_result', 'end_date', 'health_score'] as const

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  const q = getQuery(event)

  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  const clientId = q.clientId as string | undefined
  const platforms = q.platform
    ? String(q.platform).split(',').map(p => p.trim()).filter(Boolean).map(p => normalizeBudgetPlatform(p))
    : null
  const requestedSort = String(q.sortBy || '')
  const sortBy = ALLOWED_SORT.includes(requestedSort as typeof ALLOWED_SORT[number])
    ? requestedSort
    : 'spend'
  const sortDir = q.sortDir === 'asc' ? 'ASC' : 'DESC'
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
  const offset = Math.max(Number(q.offset) || 0, 0)
  const search = q.search as string | undefined

  const showInactive = q.showInactive === 'true'

  // $1,$2 = ISO start/end dates consumed by the daily_spend window CTE (day-accurate).
  // Other filters start at $3; the lead LATERAL reuses $1/$2 for its date window.
  const params: unknown[] = [startDate, endDate]
  const conditions: string[] = []
  let idx = 3

  if (clientId) {
    conditions.push(buildClientCondition(idx))
    params.push(clientId)
    idx++
  }
  if (platforms && platforms.length > 0) {
    conditions.push(`ms.platform = ANY($${idx})`)
    params.push(platforms)
    idx++
  }
  if (search) {
    const escaped = String(search).replace(/%/g, '\\%').replace(/_/g, '\\_')
    conditions.push(`ms.campaign_name ILIKE $${idx}`)
    params.push(`%${escaped}%`)
    idx++
  }
  if (!showInactive) {
    // Exclude deleted/archived/removed campaigns
    conditions.push(`(ms.campaign_status IS NULL OR ms.campaign_status NOT IN ('DELETED', 'ARCHIVED', 'REMOVED', 'deleted', 'archived', 'removed'))`)
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''

  try {
    // Count total (only campaigns with spend in the day-accurate window)
    const countResult = await queryOne(`
      SELECT COUNT(*) as count
      FROM (
        SELECT 1
        FROM media_spend ms
        LEFT JOIN social_connections sc ON ms.connection_id = sc.id
        JOIN (SELECT media_spend_id FROM daily_spend WHERE spend_date BETWEEN $1 AND $2 GROUP BY media_spend_id) d
          ON d.media_spend_id = ms.id
        ${where}
        GROUP BY
          ms.platform,
          ms.client_id,
          COALESCE(sc.account_id, ms.connection_id::text, 'unlinked'),
          COALESCE(ms.campaign_id, ms.id::text),
          ms.campaign_name,
          ms.campaign_type,
          ms.campaign_status
      ) grouped_campaigns
    `, params)
    const total = Number(countResult?.count || 0)

    // Fetch campaigns. Lead window reuses $1/$2 (same start/end dates).
    const leadStartIdx = 1
    const leadEndIdx = 2
    params.push(limit)
    const limitIdx = idx
    idx++
    params.push(offset)
    const offsetIdx = idx

    const rows = await queryRows(`
      WITH daily AS (
        SELECT ds.media_spend_id,
               SUM(ds.spend) as spend,
               SUM(ds.impressions) as impressions,
               SUM(ds.clicks) as clicks,
               SUM(ds.conversions) as conversions,
               SUM(ds.revenue) as revenue
        FROM daily_spend ds
        WHERE ds.spend_date BETWEEN $1 AND $2
        GROUP BY ds.media_spend_id
      ),
      lifetime AS (
        SELECT COALESCE(ms.connection_id::text, 'unlinked') AS connection_key,
               COALESCE(ms.campaign_id, ms.id::text) AS campaign_key,
               MIN(ds.spend_date) FILTER (WHERE ds.spend > 0) AS first_served_date,
               MAX(ds.spend_date) FILTER (WHERE ds.spend > 0) AS last_served_date
        FROM daily_spend ds
        JOIN media_spend ms ON ms.id = ds.media_spend_id
        GROUP BY COALESCE(ms.connection_id::text, 'unlinked'), COALESCE(ms.campaign_id, ms.id::text)
      ),
      campaigns AS (
        SELECT
          ms.campaign_id,
          ms.campaign_name,
          ms.platform,
          ms.campaign_type,
          ms.campaign_status,
          ms.client_id,
          c.name as client_name,
          COALESCE(sc.account_id, ms.connection_id::text, 'unlinked') as budget_account_group,
          SUM(d.spend) as spend,
          SUM(ms.budget_allocated) as budget,
          BOOL_OR(ms.budget_rolling) as budget_rolling,
          SUM(d.impressions) as impressions,
          SUM(d.clicks) as clicks,
          SUM(d.conversions) as conversions,
          COALESCE(SUM(d.revenue), 0) as revenue,
          SUM(ms.reach) as reach,
          (array_agg(ms.cost_per_result ORDER BY ms.synced_at DESC NULLS LAST))[1] as cost_per_result,
          (array_agg(ms.result_type ORDER BY ms.synced_at DESC NULLS LAST))[1] as result_type,
          (array_agg(ms.frequency ORDER BY ms.synced_at DESC NULLS LAST))[1] as frequency,
          (array_agg(ms.quality_ranking ORDER BY ms.synced_at DESC NULLS LAST))[1] as quality_ranking,
          (array_agg(ms.engagement_rate_ranking ORDER BY ms.synced_at DESC NULLS LAST))[1] as engagement_rate_ranking,
          (array_agg(ms.conversion_rate_ranking ORDER BY ms.synced_at DESC NULLS LAST))[1] as conversion_rate_ranking,
          (array_agg(ms.impression_share ORDER BY ms.synced_at DESC NULLS LAST))[1] as impression_share,
          (array_agg(ms.end_date ORDER BY ms.synced_at DESC NULLS LAST))[1] as end_date,
          (array_agg(ms.bid_strategy ORDER BY ms.synced_at DESC NULLS LAST))[1] as bid_strategy,
          (array_agg(ms.budget_type ORDER BY ms.synced_at DESC NULLS LAST))[1] as budget_type,
          (array_agg(ms.period ORDER BY ms.synced_at DESC NULLS LAST))[1] as budget_period,
          COUNT(DISTINCT ms.period)::int as budget_period_count,
          MAX(ms.synced_at) as last_synced,
          MIN(lifetime.first_served_date) as first_served_date,
          MAX(lifetime.last_served_date) as last_served_date,
          (array_agg(ms.id ORDER BY ms.synced_at DESC NULLS LAST))[1] as media_spend_id,
          (array_agg(ms.connection_id ORDER BY ms.synced_at DESC NULLS LAST))[1] as connection_id,
          (array_agg(sc.account_id ORDER BY ms.synced_at DESC NULLS LAST))[1] as connection_account_id,
          (array_agg(sc.metadata::text ORDER BY ms.synced_at DESC NULLS LAST))[1] as connection_metadata
        FROM media_spend ms
        JOIN daily d ON d.media_spend_id = ms.id
        LEFT JOIN lifetime
          ON lifetime.connection_key = COALESCE(ms.connection_id::text, 'unlinked')
         AND lifetime.campaign_key = COALESCE(ms.campaign_id, ms.id::text)
        LEFT JOIN agency_clients c ON ms.client_id = c.id
        LEFT JOIN social_connections sc ON ms.connection_id = sc.id
        ${where}
        GROUP BY
          ms.campaign_id,
          ms.campaign_name,
          ms.platform,
          ms.campaign_type,
          ms.campaign_status,
          ms.client_id,
          c.name,
          COALESCE(sc.account_id, ms.connection_id::text, 'unlinked')
      )
      SELECT
        c.*,
        COALESCE(la.lead_count, 0) AS lead_count,
        COALESCE(la.lead_new_count, 0) AS lead_new_count,
        COALESCE(la.lead_contacted_count, 0) AS lead_contacted_count,
        COALESCE(la.lead_qualified_count, 0) AS lead_qualified_count,
        COALESCE(la.lead_won_count, 0) AS lead_won_count,
        COALESCE(la.lead_lost_count, 0) AS lead_lost_count,
        CASE WHEN COALESCE(la.lead_count, 0) > 0 THEN c.spend / la.lead_count ELSE NULL END AS cost_per_lead
      FROM campaigns c
      LEFT JOIN LATERAL (
        SELECT ${PORTAL_LEAD_STATUS_SELECT}
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.submitted_at >= $${leadStartIdx}::date
          AND l.submitted_at < ($${leadEndIdx}::date + INTERVAL '1 day')
          AND l.source = ${leadSourceForPlatformSql('c')}
          AND (c.client_id IS NULL OR l.client_id = c.client_id)
          AND (
            (c.campaign_id IS NOT NULL AND l.campaign_id = c.campaign_id)
            OR (c.campaign_id IS NULL AND c.campaign_name IS NOT NULL AND l.campaign_name = c.campaign_name)
          )
      ) la ON TRUE
      ORDER BY ${sortBy === 'health_score' ? 'spend' : sortBy} ${sortDir} NULLS LAST
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, params)

    const clientIds = [...new Set(rows.map((r: any) => r.client_id).filter(Boolean))]
    const targetRows = clientIds.length
      ? await queryRows<{ client_id: string, result_type: string, target_cost_per_result: string, target_ctr: string | null, max_frequency: string | null }>(
          `SELECT client_id, result_type, target_cost_per_result, target_ctr, max_frequency
             FROM client_kpi_targets WHERE client_id = ANY($1)`, [clientIds])
      : []
    const targetByKey = new Map(targetRows.map(t => [`${t.client_id}|${t.result_type}`, t]))

    const campaigns = rows.map((r: any) => {
      const spend = toNum(r.spend)
      const impressions = toNum(r.impressions)
      const clicks = toNum(r.clicks)
      const conversions = toNum(r.conversions)
      const revenue = toNum(r.revenue)
      const metrics = computeMetrics(spend, impressions, clicks, conversions, revenue)

      const tgt = r.result_type ? targetByKey.get(`${r.client_id}|${r.result_type}`) : null
      const health = scoreCampaignHealth({
        platform: r.platform,
        costPerResult: r.cost_per_result == null ? null : toNum(r.cost_per_result),
        resultCount: conversions,
        spend,
        ctr: metrics.ctr,
        frequency: r.frequency == null ? null : Number(r.frequency),
        qualityRanking: r.quality_ranking,
        engagementRateRanking: r.engagement_rate_ranking,
        conversionRateRanking: r.conversion_rate_ranking,
        impressionShare: r.impression_share == null ? null : Number(r.impression_share),
        target: tgt
          ? {
              targetCostPerResult: toNum(tgt.target_cost_per_result),
              targetCtr: tgt.target_ctr == null ? null : Number(tgt.target_ctr),
              maxFrequency: tgt.max_frequency == null ? null : Number(tgt.max_frequency)
            }
          : null
      })

      // Build deep link URL
      let connectionData: { accountId: string, metadata: unknown } | null = null
      if (r.connection_account_id) {
        let metadata: unknown = null
        try {
          metadata = typeof r.connection_metadata === 'string'
            ? JSON.parse(r.connection_metadata)
            : r.connection_metadata
        } catch { /* ignore */ }
        connectionData = { accountId: r.connection_account_id, metadata }
      }
      const deepLinkUrl = buildCampaignDeepLink(r.platform, r.campaign_id, connectionData)
      const budgetPeriod = Number(r.budget_period_count) === 1
        ? r.budget_period
        : null
      const budgetIdentity = buildCampaignBudgetIdentity({
        tenantId,
        clientId: r.client_id,
        platform: r.platform,
        accountId: r.connection_account_id,
        connectionId: r.connection_id,
        campaignExternalId: r.campaign_id,
        campaignName: r.campaign_name,
        mediaSpendId: r.media_spend_id,
        period: budgetPeriod
      })

      return {
        rowKey: budgetIdentity.fallbackKey,
        budgetKey: budgetIdentity.key,
        budgetActionable: budgetIdentity.actionable,
        budgetIdentityIssues: budgetIdentity.issues,
        budgetPeriod: budgetIdentity.period,
        campaignId: r.campaign_id,
        campaignName: r.campaign_name,
        platform: r.platform,
        platformDisplayName: ANALYTICS_PLATFORM_LABELS[r.platform] || r.platform,
        platformColor: PLATFORM_COLORS[r.platform] || '#888888',
        campaignType: r.campaign_type,
        campaignStatus: r.campaign_status,
        clientId: r.client_id,
        clientName: r.client_name || 'Unassigned',
        spend,
        budget: toNum(r.budget),
        budgetRolling: r.budget_rolling === true,
        impressions,
        clicks,
        conversions,
        revenue,
        ...metrics,
        leadCount: Number(r.lead_count || 0),
        leadNewCount: Number(r.lead_new_count || 0),
        leadContactedCount: Number(r.lead_contacted_count || 0),
        leadQualifiedCount: Number(r.lead_qualified_count || 0),
        leadWonCount: Number(r.lead_won_count || 0),
        leadLostCount: Number(r.lead_lost_count || 0),
        costPerLead: r.cost_per_lead == null ? null : toNum(r.cost_per_lead),
        reach: toNum(r.reach),
        costPerResult: r.cost_per_result != null
          ? toNum(r.cost_per_result)
          : (r.platform === 'google_ads' && conversions > 0 ? metrics.costPerConversion ?? null : null),
        resultType: r.result_type || (r.platform === 'google_ads' && conversions > 0 ? 'Conversions' : null),
        frequency: r.frequency == null ? null : Number(r.frequency),
        firstServedDate: toDateOnly(r.first_served_date),
        lastServedDate: toDateOnly(r.last_served_date),
        endDate: toDateOnly(r.end_date),
        bidStrategy: r.bid_strategy || null,
        budgetType: r.budget_type || null,
        health,
        lastSynced: r.last_synced,
        mediaSpendId: r.media_spend_id,
        deepLinkUrl
      }
    })

    // health_score is computed in JS after LIMIT/OFFSET, so this sort is page-local
    // (not a global ranking). The SQL above falls back to ORDER BY spend to keep page
    // composition stable across requests.
    if (sortBy === 'health_score') {
      const dir = sortDir === 'ASC' ? 1 : -1
      campaigns.sort((a, b) => {
        const av = a.health?.score, bv = b.health?.score
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        return (av - bv) * dir
      })
    }

    return { campaigns, total, limit, offset }
  } catch (error) {
    console.error('Analytics campaigns failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch campaigns' })
  }
})
