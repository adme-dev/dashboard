import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { getMonthlySpend, refreshGoogleToken } from '~~/server/utils/googleAdsClient'
import {
  GOOGLE_CREDENTIAL_PROFILE_JOIN,
  GOOGLE_CREDENTIAL_PROFILE_SELECT,
  persistGoogleCredentialRefresh,
  resolveGoogleCredential,
  type GoogleCredentialRow,
} from '~~/server/utils/googleCredentialProfiles'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

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

  const config = resolveGoogleAdsRuntimeConfig(undefined, event)

  const conn = await queryOne<GoogleCredentialRow & {
    id: string
    account_id: string
    account_name: string
    access_token: string
    refresh_token: string | null
    token_expires_at: string | null
    status: string
    metadata: any
  }>(
    `SELECT sc.id, sc.account_id, sc.account_name, sc.access_token,
            sc.refresh_token, sc.token_expires_at, sc.status, sc.metadata,
            ${GOOGLE_CREDENTIAL_PROFILE_SELECT}
     FROM social_connections sc
     ${GOOGLE_CREDENTIAL_PROFILE_JOIN}
     WHERE sc.id = $1 AND sc.platform = 'google'`,
    [connectionId]
  )

  if (!conn) {
    throw createError({ statusCode: 404, statusMessage: 'Google Ads connection not found' })
  }

  if (conn.status !== 'active') {
    throw createError({ statusCode: 400, statusMessage: `Connection is ${conn.status}. Please reconnect.` })
  }

  const credential = await resolveGoogleCredential(conn)

  // Refresh token if expired
  let accessToken = credential.accessToken
  if (credential.refreshToken && credential.tokenExpiresAt) {
    const expiresAt = new Date(credential.tokenExpiresAt)
    if (expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      try {
        const refreshed = await refreshGoogleToken(
          credential.refreshToken,
          config.googleClientId,
          config.googleClientSecret
        )
        accessToken = refreshed.access_token
        const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000)
        await persistGoogleCredentialRefresh({
          connectionId: conn.id,
          profileId: credential.profileId,
          accessToken,
          expiresAt: newExpiry,
        })
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
    year,
    conn.metadata?.managerCustomerId || undefined
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
