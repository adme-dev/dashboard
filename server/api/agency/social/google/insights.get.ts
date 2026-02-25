import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getMonthlySpend, refreshGoogleToken } from '~~/server/utils/googleAdsClient'

/**
 * GET /api/agency/social/google/insights?accountId=X&month=Y&year=Z
 * Live call to Google Ads API for campaign-level metrics (not cached)
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

  const config = useRuntimeConfig()

  const conn = await queryOne<{
    id: string
    account_id: string
    account_name: string
    access_token: string
    refresh_token: string | null
    token_expires_at: string | null
    status: string
  }>(
    `SELECT id, account_id, account_name, access_token, refresh_token, token_expires_at, status
     FROM social_connections
     WHERE id = $1 AND platform = 'google'`,
    [connectionId]
  )

  if (!conn) {
    throw createError({ statusCode: 404, statusMessage: 'Google Ads connection not found' })
  }

  if (conn.status !== 'active') {
    throw createError({ statusCode: 400, statusMessage: `Connection is ${conn.status}. Please reconnect.` })
  }

  // Refresh token if expired
  let accessToken = conn.access_token
  if (conn.refresh_token && conn.token_expires_at) {
    const expiresAt = new Date(conn.token_expires_at)
    if (expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      try {
        const refreshed = await refreshGoogleToken(
          conn.refresh_token,
          config.googleClientId,
          config.googleClientSecret
        )
        accessToken = refreshed.access_token
        const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000)
        await queryOne(
          `UPDATE social_connections SET access_token = $1, token_expires_at = $2, updated_at = NOW() WHERE id = $3`,
          [accessToken, newExpiry, conn.id]
        )
      } catch {
        throw createError({ statusCode: 401, statusMessage: 'Failed to refresh Google token. Please reconnect.' })
      }
    }
  }

  const campaigns = await getMonthlySpend(
    conn.account_id,
    accessToken,
    config.googleDeveloperToken,
    month,
    year
  )

  return {
    accountId: conn.account_id,
    accountName: conn.account_name,
    month,
    year,
    campaigns: campaigns.map(c => ({
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      spend: c.spend,
      impressions: c.impressions,
      clicks: c.clicks,
      conversions: c.conversions
    })),
    totalSpend: campaigns.reduce((sum: number, c) => sum + c.spend, 0)
  }
})
