import { getCookie, deleteCookie, sendRedirect, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  exchangeTwitterToken,
  getTwitterAdAccounts
} from '~~/server/utils/twitterClient'

/**
 * GET /api/agency/social/twitter/callback
 * OAuth 2.0 PKCE callback — exchanges code + verifier for tokens, stores ad accounts.
 * X sends `code` as query param. We read the code_verifier from the httpOnly cookie.
 */
export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)

    const code = String(query.code || '')
    const state = String(query.state || '')
    const expectedState = getCookie(event, 'twitter_oauth_state')
    const codeVerifier = getCookie(event, 'twitter_pkce_verifier')

    if (!code || !state || !expectedState || state !== expectedState) {
      return sendRedirect(event, '/auth/oauth-callback?platform=twitter&success=false&error=' + encodeURIComponent('Invalid OAuth state. Please try again.'), 302)
    }

    if (!codeVerifier) {
      return sendRedirect(event, '/auth/oauth-callback?platform=twitter&success=false&error=' + encodeURIComponent('PKCE verifier missing. Please try again.'), 302)
    }

    // Clear OAuth cookies
    deleteCookie(event, 'twitter_oauth_state', { path: '/' })
    deleteCookie(event, 'twitter_pkce_verifier', { path: '/' })

    const config = useRuntimeConfig()

    // Build absolute redirect URI (must match what was used in connect.get.ts)
    const reqUrl = getRequestURL(event)
    const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
    const redirectUri = config.twitterRedirectUri.startsWith('http')
      ? config.twitterRedirectUri
      : `${publicUrl}${config.twitterRedirectUri}`

    // Exchange code + verifier for tokens
    const tokenResult = await exchangeTwitterToken(
      code,
      config.twitterClientId,
      config.twitterClientSecret,
      redirectUri,
      codeVerifier
    )

    // Fetch ad accounts
    let adAccounts: Awaited<ReturnType<typeof getTwitterAdAccounts>> = []
    try {
      adAccounts = await getTwitterAdAccounts(tokenResult.access_token)
    } catch (err: any) {
      console.warn('[Twitter Callback] Could not fetch ad accounts:', err.message)
    }

    if (adAccounts.length === 0) {
      // Store as a single connection without specific ad account
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
          'twitter',
          'twitter_user', // placeholder until we fetch accounts
          'X (Twitter) Ads',
          tokenResult.access_token,
          tokenResult.refresh_token || null,
          tokenResult.expires_in ? new Date(Date.now() + tokenResult.expires_in * 1000) : null,
          (tokenResult.scope || 'ads.read offline.access').split(' '),
          'active',
          JSON.stringify({ noAdAccounts: true }),
          user.id,
        ]
      )
      return sendRedirect(event, '/auth/oauth-callback?platform=twitter&success=true&accounts=0', 302)
    }

    // Store each ad account as a social_connection
    for (const acct of adAccounts) {
      const tokenExpiry = tokenResult.expires_in
        ? new Date(Date.now() + tokenResult.expires_in * 1000)
        : null

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
          'twitter',
          acct.id,
          acct.name,
          tokenResult.access_token,
          tokenResult.refresh_token || null,
          tokenExpiry,
          (tokenResult.scope || 'ads.read offline.access').split(' '),
          'active',
          JSON.stringify({
            currency: acct.currency,
            timezone: acct.timezone,
            approvalStatus: acct.approval_status,
          }),
          user.id,
        ]
      )
    }

    return sendRedirect(event, `/auth/oauth-callback?platform=twitter&success=true&accounts=${adAccounts.length}`, 302)
  } catch (err: any) {
    console.error('[Twitter Callback] Error:', err.message || err)
    const msg = err.data?.statusMessage || err.message || 'Connection failed'
    return sendRedirect(event, `/auth/oauth-callback?platform=twitter&success=false&error=${encodeURIComponent(msg)}`, 302)
  }
})
