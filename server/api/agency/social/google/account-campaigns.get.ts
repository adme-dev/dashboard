import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'
import { buildCampaignBudgetIdentity } from '~~/server/utils/campaignBudgetIdentity'

/**
 * GET /api/agency/social/google/account-campaigns?connectionId=X&month=Y&year=Z
 * Returns campaign rows from media_spend for a single Google Ads connection
 */
export default eventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)

  const query = getQuery(event)
  const connectionId = String(query.connectionId || '')
  if (!connectionId) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId is required' })
  }

  const now = new Date()
  const month = parseInt(String(query.month)) || (now.getMonth() + 1)
  const year = parseInt(String(query.year)) || now.getFullYear()
  const period = `${year}-${String(month).padStart(2, '0')}`
  const unlinkedPrefix = 'unlinked:google:'
  const campaignQuery: [string, unknown[]] = connectionId.startsWith(unlinkedPrefix)
    ? (() => {
        const clientId = connectionId.startsWith(`${unlinkedPrefix}client:`)
          ? connectionId.slice(`${unlinkedPrefix}client:`.length)
          : null
        return [
          `SELECT id, campaign_id, campaign_name, actual_spend, budget_allocated, COALESCE(budget_rolling, false) as budget_rolling,
             commission_rate, impressions, clicks,
             conversions, campaign_type, campaign_status, synced_at, client_id,
             connection_id::text as connection_id,
             (SELECT account_id FROM social_connections sc WHERE sc.id = media_spend.connection_id) as budget_account_id
           FROM media_spend
           WHERE connection_id IS NULL AND period = $1 AND platform = 'google_ads'
             AND ${clientId ? 'client_id = $2::uuid' : 'client_id IS NULL'}
           ORDER BY actual_spend DESC`,
          clientId ? [period, clientId] : [period],
        ]
      })()
    : [
        `SELECT id, campaign_id, campaign_name, actual_spend, budget_allocated, COALESCE(budget_rolling, false) as budget_rolling,
           commission_rate, impressions, clicks,
           conversions, campaign_type, campaign_status, synced_at, client_id,
           connection_id::text as connection_id,
           (SELECT account_id FROM social_connections sc WHERE sc.id = media_spend.connection_id) as budget_account_id
         FROM media_spend
         WHERE connection_id = $1 AND period = $2 AND platform = 'google_ads'
         ORDER BY actual_spend DESC`,
        [connectionId, period],
      ]

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
    client_id: string | null
    connection_id: string | null
    budget_account_id: string | null
  }>(campaignQuery[0], campaignQuery[1])

  return rows.map((r) => {
    const budgetIdentity = buildCampaignBudgetIdentity({
      tenantId,
      clientId: r.client_id,
      platform: 'google_ads',
      accountId: r.budget_account_id,
      connectionId: r.connection_id,
      campaignExternalId: r.campaign_id,
      campaignName: r.campaign_name,
      mediaSpendId: r.id,
      period
    })

    return {
      id: r.id,
      budgetKey: budgetIdentity.key,
      budgetActionable: budgetIdentity.actionable,
      budgetIdentityIssues: budgetIdentity.issues,
      budgetPeriod: budgetIdentity.period,
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
    }
  })
})
