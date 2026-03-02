import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getLinkedInCampaignInsights } from '~~/server/utils/linkedinClient'

/**
 * GET /api/agency/social/linkedin/insights?accountId=X&month=Y&year=Z
 * Live call to LinkedIn API for campaign-level metrics (not cached)
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const connectionId = String(query.accountId || query.connectionId || '')
  const now = new Date()
  const month = parseInt(String(query.month || now.getMonth() + 1), 10)
  const year = parseInt(String(query.year || now.getFullYear()), 10)

  if (!connectionId) {
    throw createError({ statusCode: 400, statusMessage: 'accountId is required' })
  }

  // Get the connection and its token
  const conn = await queryOne<{
    id: string
    account_id: string
    account_name: string
    access_token: string
    metadata: any
    status: string
  }>(
    `SELECT id, account_id, account_name, access_token, metadata, status
     FROM social_connections
     WHERE id = $1 AND platform = 'linkedin'`,
    [connectionId]
  )

  if (!conn) {
    throw createError({ statusCode: 404, statusMessage: 'LinkedIn connection not found' })
  }

  if (conn.status !== 'active') {
    throw createError({ statusCode: 400, statusMessage: `Connection is ${conn.status}. Please reconnect.` })
  }

  const campaigns = await getLinkedInCampaignInsights(conn.account_id, conn.access_token, month, year)

  return {
    accountId: conn.account_id,
    accountName: conn.account_name,
    month,
    year,
    campaigns: campaigns.map(c => ({
      campaignId: c.campaign_id,
      campaignName: c.campaign_name,
      spend: parseFloat(c.spend || '0'),
      impressions: parseInt(c.impressions || '0', 10),
      clicks: parseInt(c.clicks || '0', 10),
      conversions: parseInt(c.conversions || '0', 10),
      date: c.date,
    })),
    totalSpend: campaigns.reduce((sum: number, c) => sum + parseFloat(c.spend || '0'), 0)
  }
})
