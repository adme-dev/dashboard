import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  getMicrosoftUser,
  getMicrosoftAdAccounts,
} from '~~/server/utils/microsoftAdsClient'

/**
 * POST /api/agency/social/microsoft_ads/connect-token
 * Manual token entry — validates a Microsoft Ads access token + refresh token,
 * discovers accounts, and stores them.
 * Body: { accessToken, refreshToken?, expiresIn? }
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)
  const token = String(body?.accessToken || '').trim()
  const refreshToken = String(body?.refreshToken || '').trim() || null
  const expiresIn = parseInt(body?.expiresIn) || 3600

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Access token is required' })
  }

  const config = useRuntimeConfig()
  if (!config.microsoftAdsDeveloperToken) {
    throw createError({ statusCode: 500, statusMessage: 'Microsoft Ads developer token not configured' })
  }

  // Validate token by fetching user info
  let customerId: string
  try {
    const userInfo = await getMicrosoftUser(token, config.microsoftAdsDeveloperToken)
    customerId = userInfo.customerId
  } catch (err: any) {
    const msg = err.data?.message || err.message || 'Invalid token'
    throw createError({ statusCode: 400, statusMessage: `Invalid token: ${msg}` })
  }

  if (!customerId) {
    throw createError({ statusCode: 400, statusMessage: 'Could not determine customer ID from token' })
  }

  // Fetch ad accounts
  let accounts: Awaited<ReturnType<typeof getMicrosoftAdAccounts>> = []
  try {
    accounts = await getMicrosoftAdAccounts(token, config.microsoftAdsDeveloperToken, customerId)
  } catch (err: any) {
    console.warn('[Microsoft Ads ConnectToken] Could not fetch accounts:', err.message)
    accounts = [{
      account_id: customerId,
      account_name: `Microsoft Ads Customer ${customerId}`,
      account_number: '',
      currency: 'USD',
      status: 'Active',
      customer_id: customerId,
    }]
  }

  if (accounts.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No ad accounts found for this token' })
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000)

  // Store each account
  for (const acct of accounts) {
    await queryOne(
      `INSERT INTO social_connections (platform, account_id, account_name, access_token, refresh_token, token_expires_at, scopes, status, metadata, connected_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (platform, account_id)
       DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         scopes = EXCLUDED.scopes,
         status = 'active',
         metadata = EXCLUDED.metadata,
         connected_by = EXCLUDED.connected_by,
         updated_at = NOW()
       RETURNING id`,
      [
        'microsoft_ads',
        acct.account_id,
        acct.account_name,
        token,
        refreshToken,
        expiresAt,
        ['msads.manage'],
        'active',
        JSON.stringify({
          customerId: acct.customer_id,
          accountNumber: acct.account_number,
          currency: acct.currency,
          accountStatus: acct.status,
          manualToken: true,
        }),
        user.id
      ]
    )
  }

  return { success: true, accounts: accounts.length, message: `Connected ${accounts.length} ad account(s)` }
})
