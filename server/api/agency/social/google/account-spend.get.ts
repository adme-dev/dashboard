import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { cachedFetch } from '~~/server/utils/kv'

/**
 * GET /api/agency/social/google/account-spend?month=X&year=Y
 * Aggregates media_spend by connection for Google Ads accounts
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const now = new Date()
  const month = parseInt(String(query.month)) || (now.getMonth() + 1)
  const year = parseInt(String(query.year)) || now.getFullYear()
  const period = `${year}-${String(month).padStart(2, '0')}`

  const cacheKey = `spend:google:accounts:${period}`

  return cachedFetch(event, cacheKey, 300, async () => {
  const rows = await queryRows<{
    id: string
    account_id: string
    account_name: string
    status: string
    metadata: any
    client_id: string | null
    client_name: string | null
    total_spend: string
    total_budget: string
    total_impressions: string
    total_clicks: string
    total_conversions: string
    total_commission: string
    max_commission_rate: string | null
    campaign_count: number
    last_synced_at: string | null
  }>(
    `SELECT sc.id, sc.account_id, sc.account_name, sc.status, sc.metadata,
       sc.client_id, ac.name as client_name,
       COALESCE(SUM(ms.actual_spend), 0) as total_spend,
       COALESCE(SUM(ms.budget_allocated), 0) as total_budget,
       COALESCE(SUM(ms.impressions), 0) as total_impressions,
       COALESCE(SUM(ms.clicks), 0) as total_clicks,
       COALESCE(SUM(ms.conversions), 0) as total_conversions,
       COALESCE(SUM(ms.commission_amount), 0) as total_commission,
       MAX(ms.commission_rate) as max_commission_rate,
       COUNT(ms.id)::int as campaign_count,
       MAX(ms.synced_at) as last_synced_at
     FROM social_connections sc
     LEFT JOIN agency_clients ac ON ac.id = sc.client_id
     LEFT JOIN media_spend ms ON ms.connection_id = sc.id AND ms.period = $1
     WHERE sc.platform = 'google' AND sc.status = 'active'
     GROUP BY sc.id, ac.name
     ORDER BY COALESCE(SUM(ms.actual_spend), 0) DESC`,
    [period]
  )

  return rows.map(r => ({
    id: r.id,
    accountId: r.account_id,
    accountName: r.account_name,
    status: r.status,
    metadata: r.metadata,
    clientId: r.client_id,
    clientName: r.client_name,
    totalSpend: parseFloat(r.total_spend) || 0,
    totalBudget: parseFloat(r.total_budget) || 0,
    totalImpressions: parseInt(r.total_impressions) || 0,
    totalClicks: parseInt(r.total_clicks) || 0,
    totalConversions: parseFloat(r.total_conversions) || 0,
    totalCommission: parseFloat(r.total_commission) || 0,
    commissionRate: parseFloat(r.max_commission_rate || '0') || 0,
    campaignCount: r.campaign_count,
    lastSyncedAt: r.last_synced_at,
  }))
  }) // end cachedFetch
})
