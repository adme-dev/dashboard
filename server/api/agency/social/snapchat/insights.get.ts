import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getSnapchatCampaignStats, refreshSnapchatToken } from '~~/server/utils/snapchatClient'

/**
 * GET /api/agency/social/snapchat/insights?accountId=X&month=Y&year=Z
 * Live call to Snapchat API for campaign-level metrics (not cached).
 * Automatically refreshes token if expired (30min lifetime).
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
    refresh_token: string | null
    token_expires_at: string | null
    metadata: any
    status: string
  }>(
    `SELECT id, account_id, account_name, access_token, refresh_token, token_expires_at, metadata, status
     FROM social_connections
     WHERE id = $1 AND platform = 'snapchat'`,
    [connectionId]
  )

  if (!conn) {
    throw createError({ statusCode: 404, statusMessage: 'Snapchat connection not found' })
  }

  if (conn.status !== 'active') {
    throw createError({ statusCode: 400, statusMessage: `Connection is ${conn.status}. Please reconnect.` })
  }

  // Refresh token if expired or about to expire (within 5 min)
  let accessToken = conn.access_token
  if (conn.refresh_token && conn.token_expires_at) {
    const expiresAt = new Date(conn.token_expires_at)
    if (expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      try {
        const config = useRuntimeConfig()
        const refreshed = await refreshSnapchatToken(
          conn.refresh_token,
          config.snapchatClientId,
          config.snapchatClientSecret
        )
        accessToken = refreshed.access_token
        const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000)
        await queryOne(
          `UPDATE social_connections SET access_token = $1, refresh_token = $2, token_expires_at = $3, updated_at = NOW() WHERE id = $4`,
          [accessToken, refreshed.refresh_token, newExpiry, conn.id]
        )
      } catch (err: any) {
        throw createError({ statusCode: 401, statusMessage: `Token refresh failed: ${err.message}. Please reconnect.` })
      }
    }
  }

  const campaigns = await getSnapchatCampaignStats(conn.account_id, accessToken, month, year)

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
