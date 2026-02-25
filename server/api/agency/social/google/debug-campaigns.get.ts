import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { refreshGoogleToken, listAccessibleCustomers } from '~~/server/utils/googleAdsClient'
import { ofetch } from 'ofetch'

/**
 * GET /api/agency/social/google/debug-campaigns?accountId=XXXX&loginCustomerId=YYYY
 * Returns raw GAQL response with all useful campaign fields for one account.
 * Handles token refresh. Pass loginCustomerId for sub-accounts under an MCC.
 * Temporary debug endpoint — remove after inspecting payload.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const accountId = String(query.accountId || '')
  if (!accountId) {
    throw createError({ statusCode: 400, statusMessage: 'accountId required' })
  }

  const config = useRuntimeConfig()

  // Get stored tokens for this account
  const conn = await queryOne<{
    id: string
    access_token: string
    refresh_token: string | null
    token_expires_at: string | null
  }>(
    `SELECT id, access_token, refresh_token, token_expires_at
     FROM social_connections
     WHERE platform = 'google' AND account_id = $1 AND status = 'active'`,
    [accountId]
  )
  if (!conn) {
    throw createError({ statusCode: 404, statusMessage: 'No active Google connection for this account' })
  }

  // Refresh token if expired or about to expire
  let accessToken = conn.access_token
  if (conn.refresh_token) {
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : new Date(0)
    if (expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      console.log(`[DebugCampaigns] Refreshing expired token for account ${accountId}`)
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
    }
  }

  // Find MCC login-customer-id: use param, or auto-detect from accessible customers
  let loginCustomerId = String(query.loginCustomerId || '')
  if (!loginCustomerId) {
    try {
      const accessibleIds = await listAccessibleCustomers(accessToken, config.googleDeveloperToken)
      // The accessible customers are typically the MCC accounts
      // Use the first one that is NOT the target account
      loginCustomerId = accessibleIds.find(id => id !== accountId.replace(/-/g, '')) || accessibleIds[0] || ''
      console.log(`[DebugCampaigns] Auto-detected login-customer-id: ${loginCustomerId} from ${accessibleIds.length} accessible customers`)
    } catch (err: any) {
      console.error(`[DebugCampaigns] Could not list accessible customers:`, err.message)
    }
  }

  const now = new Date()
  const month = parseInt(String(query.month || now.getMonth() + 1), 10)
  const year = parseInt(String(query.year || now.getFullYear()), 10)
  const lastDay = new Date(year, month, 0).getDate()
  const since = `${year}-${String(month).padStart(2, '0')}-01`
  const until = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const campaignGaql = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.advertising_channel_sub_type,
      campaign.bidding_strategy_type,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc,
      metrics.average_cpm,
      metrics.interactions
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
    ORDER BY metrics.cost_micros DESC
  `

  const customerGaql = `
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.status,
      customer.manager
    FROM customer
    LIMIT 1
  `

  const cleanId = accountId.replace(/-/g, '')
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': config.googleDeveloperToken,
    'Content-Type': 'application/json'
  }
  if (loginCustomerId) {
    headers['login-customer-id'] = loginCustomerId.replace(/-/g, '')
  }

  const results: any = {
    accountId,
    loginCustomerId: loginCustomerId || 'none',
    period: `${since} to ${until}`
  }

  // Fetch customer info
  try {
    const customerResp = await ofetch(
      `https://googleads.googleapis.com/v23/customers/${cleanId}/googleAds:searchStream`,
      { method: 'POST', headers, body: { query: customerGaql } }
    )
    results.customer = customerResp
  } catch (err: any) {
    results.customerError = err.data || err.message
  }

  // Fetch campaigns
  try {
    const campaignResp = await ofetch(
      `https://googleads.googleapis.com/v23/customers/${cleanId}/googleAds:searchStream`,
      { method: 'POST', headers, body: { query: campaignGaql } }
    )
    results.campaigns = campaignResp
  } catch (err: any) {
    results.campaignError = err.data || err.message
  }

  return results
})
