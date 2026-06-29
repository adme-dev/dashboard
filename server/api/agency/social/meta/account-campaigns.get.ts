import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { toDateOnly } from '~~/server/utils/analyticsMetrics'
import { scoreCampaignHealth } from '~~/server/utils/campaignHealth'

/**
 * GET /api/agency/social/meta/account-campaigns?connectionId=X&month=Y&year=Z
 * Returns campaign rows from media_spend for a single Meta ad account
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const connectionId = String(query.connectionId || '')
  if (!connectionId) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
  }

  const now = new Date()
  const month = parseInt(String(query.month)) || (now.getMonth() + 1)
  const year = parseInt(String(query.year)) || now.getFullYear()
  const period = `${year}-${String(month).padStart(2, '0')}`
  const unlinkedPrefix = 'unlinked:meta:'
  const campaignQuery = connectionId.startsWith(unlinkedPrefix)
    ? (() => {
        const clientId = connectionId.startsWith(`${unlinkedPrefix}client:`)
          ? connectionId.slice(`${unlinkedPrefix}client:`.length)
          : null
        return [
          `SELECT id, campaign_id, campaign_name, actual_spend, budget_allocated, COALESCE(budget_rolling, false) as budget_rolling,
             commission_rate, impressions, clicks,
             conversions, campaign_type, campaign_status, synced_at,
             reach, cost_per_result, result_type, end_date, bid_strategy, budget_type,
             client_id, frequency, quality_ranking, engagement_rate_ranking,
             conversion_rate_ranking, impression_share
           FROM media_spend
           WHERE connection_id IS NULL AND period = $1 AND platform = 'meta'
             AND ${clientId ? 'client_id = $2::uuid' : 'client_id IS NULL'}
           ORDER BY actual_spend DESC`,
          clientId ? [period, clientId] : [period],
        ] as const
      })()
    : [
        `SELECT id, campaign_id, campaign_name, actual_spend, budget_allocated, COALESCE(budget_rolling, false) as budget_rolling,
           commission_rate, impressions, clicks,
           conversions, campaign_type, campaign_status, synced_at,
           reach, cost_per_result, result_type, end_date, bid_strategy, budget_type,
           client_id, frequency, quality_ranking, engagement_rate_ranking,
           conversion_rate_ranking, impression_share
         FROM media_spend
         WHERE connection_id = $1 AND period = $2 AND platform = 'meta'
         ORDER BY actual_spend DESC`,
        [connectionId, period],
      ] as const

  const rows = await queryRows<{
    id: string
    campaign_id: string
    campaign_name: string
    actual_spend: number
    budget_allocated: number
    budget_rolling: boolean
    impressions: number
    clicks: number
    conversions: number
    commission_rate: number | null
    campaign_type: string | null
    campaign_status: string | null
    synced_at: string | null
    reach: number | null
    cost_per_result: number | null
    result_type: string | null
    end_date: string | null
    bid_strategy: string | null
    budget_type: string | null
    client_id: string | null
    frequency: number | null
    quality_ranking: string | null
    engagement_rate_ranking: string | null
    conversion_rate_ranking: string | null
    impression_share: number | null
  }>(campaignQuery[0], campaignQuery[1])

  const clientIds = [...new Set(rows.map(r => r.client_id).filter(Boolean))]
  const targetRows = clientIds.length
    ? await queryRows<{ client_id: string; result_type: string; target_cost_per_result: string; target_ctr: string | null; max_frequency: string | null }>(
        `SELECT client_id, result_type, target_cost_per_result, target_ctr, max_frequency
           FROM client_kpi_targets WHERE client_id = ANY($1)`, [clientIds])
    : []
  const targetByKey = new Map(targetRows.map(t => [`${t.client_id}|${t.result_type}`, t]))

  return rows.map(r => ({
    id: r.id,
    campaignId: r.campaign_id || r.id,
    campaignName: r.campaign_name,
    spend: r.actual_spend,
    budget: r.budget_allocated,
    rolling: r.budget_rolling,
    commissionRate: r.commission_rate || 0,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions,
    campaignType: r.campaign_type,
    campaignStatus: r.campaign_status,
    syncedAt: r.synced_at,
    reach: r.reach != null ? Number(r.reach) : null,
    costPerResult: r.cost_per_result != null ? Number(r.cost_per_result) : null,
    resultType: r.result_type,
    endDate: toDateOnly(r.end_date),
    bidStrategy: r.bid_strategy,
    budgetType: r.budget_type,
    health: scoreCampaignHealth({
      platform: 'meta',
      costPerResult: r.cost_per_result == null ? null : Number(r.cost_per_result),
      resultCount: Number(r.conversions) || 0,
      spend: Number(r.actual_spend) || 0,
      ctr: Number(r.impressions) > 0 ? (Number(r.clicks) / Number(r.impressions)) * 100 : null,
      frequency: r.frequency == null ? null : Number(r.frequency),
      qualityRanking: r.quality_ranking,
      engagementRateRanking: r.engagement_rate_ranking,
      conversionRateRanking: r.conversion_rate_ranking,
      impressionShare: r.impression_share == null ? null : Number(r.impression_share),
      target: (() => {
        const t = r.result_type ? targetByKey.get(`${r.client_id}|${r.result_type}`) : null
        return t ? {
          targetCostPerResult: Number(t.target_cost_per_result),
          targetCtr: t.target_ctr == null ? null : Number(t.target_ctr),
          maxFrequency: t.max_frequency == null ? null : Number(t.max_frequency),
        } : null
      })(),
    }),
  }))
})
