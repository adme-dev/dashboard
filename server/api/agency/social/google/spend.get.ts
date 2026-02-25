import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/**
 * GET /api/agency/social/google/spend?month=X&year=Y
 * Returns cached Google spend from media_spend table, grouped by client
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const now = new Date()
  const month = parseInt(String(query.month || now.getMonth() + 1), 10)
  const year = parseInt(String(query.year || now.getFullYear()), 10)
  const period = `${year}-${String(month).padStart(2, '0')}`

  const rows = await queryRows(
    `SELECT
       ms.id,
       ms.client_id,
       ac.name AS client_name,
       ms.platform,
       ms.period,
       ms.budget_allocated,
       ms.actual_spend,
       ms.commission_rate,
       ms.commission_amount,
       ms.campaign_id,
       ms.campaign_name,
       ms.impressions,
       ms.clicks,
       ms.conversions,
       ms.synced_at,
       ms.connection_id
     FROM media_spend ms
     LEFT JOIN agency_clients ac ON ms.client_id = ac.id
     WHERE ms.platform = 'google_ads'
       AND ms.period = $1
     ORDER BY ac.name ASC, ms.campaign_name ASC`,
    [period]
  )

  return rows.map((r: any) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    platform: r.platform,
    period: r.period,
    budgetAllocated: parseFloat(r.budget_allocated) || 0,
    actualSpend: parseFloat(r.actual_spend) || 0,
    commissionRate: parseFloat(r.commission_rate) || 0,
    commissionAmount: parseFloat(r.commission_amount) || 0,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions,
    syncedAt: r.synced_at,
    connectionId: r.connection_id
  }))
})
