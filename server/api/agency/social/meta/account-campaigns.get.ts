import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

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
  }>(
    `SELECT id, campaign_id, campaign_name, actual_spend, budget_allocated, COALESCE(budget_rolling, false) as budget_rolling,
       commission_rate, impressions, clicks,
       conversions, campaign_type, campaign_status, synced_at,
       reach, cost_per_result, result_type, end_date, bid_strategy, budget_type
     FROM media_spend
     WHERE connection_id = $1 AND period = $2 AND platform = 'meta'
     ORDER BY actual_spend DESC`,
    [connectionId, period]
  )

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
    reach: r.reach,
    costPerResult: r.cost_per_result,
    resultType: r.result_type,
    endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
    bidStrategy: r.bid_strategy,
    budgetType: r.budget_type,
  }))
})
