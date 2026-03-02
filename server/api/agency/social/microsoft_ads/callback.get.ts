import { getCookie, deleteCookie, sendRedirect, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  exchangeMicrosoftToken,
  getMicrosoftUser,
  getMicrosoftAdAccounts,
} from '~~/server/utils/microsoftAdsClient'

/**
 * GET /api/agency/social/microsoft_ads/callback
 * OAuth callback — exchanges code for tokens, discovers accounts, stores connections.
 */
export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)

    const code = String(query.code || '')
    const state = String(query.state || '')
    const expectedState = getCookie(event, 'microsoft_ads_oauth_state')

    if (!code || !state || !expectedState || state !== expectedState) {
      return sendRedirect(event, '/auth/oauth-callback?platform=microsoft_ads&success=false&error=' + encodeURIComponent('Invalid OAuth state. Please try again.'), 302)
    }

    deleteCookie(event, 'microsoft_ads_oauth_state', { path: '/' })

    const config = useRuntimeConfig()

    // Build redirect URI (must match what was sent in connect)
    const reqUrl = getRequestURL(event)
    const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
    const redirectUri = config.microsoftAdsRedirectUri.startsWith('http')
      ? config.microsoftAdsRedirectUri
      : `${publicUrl}${config.microsoftAdsRedirectUri}`

    // Exchange code for tokens
    const tokenResult = await exchangeMicrosoftToken(
      code,
      config.microsoftAdsClientId,
      config.microsoftAdsClientSecret,
      redirectUri
    )

    // Discover customer ID via GetUser
    let customerId = ''
    try {
      const userInfo = await getMicrosoftUser(
        tokenResult.access_token,
        config.microsoftAdsDeveloperToken
      )
      customerId = userInfo.customerId
    } catch (err: any) {
      console.warn('[Microsoft Ads Callback] Could not fetch user info:', err.message)
    }

    // Fetch ad accounts
    let accounts: Awaited<ReturnType<typeof getMicrosoftAdAccounts>> = []
    if (customerId) {
      try {
        accounts = await getMicrosoftAdAccounts(
          tokenResult.access_token,
          config.microsoftAdsDeveloperToken,
          customerId
        )
      } catch (err: any) {
        console.warn('[Microsoft Ads Callback] Could not fetch accounts:', err.message)
      }
    }

    // If no accounts found, create a placeholder using customerId
    if (accounts.length === 0 && customerId) {
      accounts = [{
        account_id: customerId,
        account_name: `Microsoft Ads Customer ${customerId}`,
        account_number: '',
        currency: 'USD',
        status: 'Active',
        customer_id: customerId,
      }]
    }

    const expiresAt = new Date(Date.now() + tokenResult.expires_in * 1000)

    // Store each account as a social_connection
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
          tokenResult.access_token,
          tokenResult.refresh_token,
          expiresAt,
          ['msads.manage'],
          'active',
          JSON.stringify({
            customerId: acct.customer_id,
            accountNumber: acct.account_number,
            currency: acct.currency,
            accountStatus: acct.status,
          }),
          user.id
        ]
      )
    }

    return sendRedirect(event, `/auth/oauth-callback?platform=microsoft_ads&success=true&accounts=${accounts.length}`, 302)
  } catch (err: any) {
    console.error('[Microsoft Ads Callback] Error:', err.message || err)
    const msg = err.data?.statusMessage || err.message || 'Connection failed'
    return sendRedirect(event, `/auth/oauth-callback?platform=microsoft_ads&success=false&error=${encodeURIComponent(msg)}`, 302)
  }
})
