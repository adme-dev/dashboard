import { getCookie, deleteCookie, sendRedirect, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  exchangePinterestToken,
  getPinterestAdAccounts
} from '~~/server/utils/pinterestClient'

/**
 * GET /api/agency/social/pinterest/callback
 * OAuth callback — exchanges code for tokens, stores ad accounts.
 * Pinterest uses Basic auth for token exchange (not body params).
 */
export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)

    const code = String(query.code || '')
    const state = String(query.state || '')
    const expectedState = getCookie(event, 'pinterest_oauth_state')

    if (!code || !state || !expectedState || state !== expectedState) {
      return sendRedirect(event, '/auth/oauth-callback?platform=pinterest&success=false&error=' + encodeURIComponent('Invalid OAuth state. Please try again.'), 302)
    }

    deleteCookie(event, 'pinterest_oauth_state', { path: '/' })

    const config = useRuntimeConfig()

    // Build absolute redirect URI (must match the one used in connect)
    const reqUrl = getRequestURL(event)
    const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
    const redirectUri = config.pinterestRedirectUri.startsWith('http')
      ? config.pinterestRedirectUri
      : `${publicUrl}${config.pinterestRedirectUri}`

    // Exchange code for tokens using Basic auth
    const tokenResult = await exchangePinterestToken(
      code,
      config.pinterestAppId,
      config.pinterestAppSecret,
      redirectUri
    )

    // Fetch ad account details
    let adAccounts: Awaited<ReturnType<typeof getPinterestAdAccounts>> = []
    try {
      adAccounts = await getPinterestAdAccounts(tokenResult.access_token)
    } catch (err: any) {
      console.warn('[Pinterest Callback] Could not fetch ad account details:', err.message)
    }

    if (adAccounts.length === 0) {
      return sendRedirect(event, '/auth/oauth-callback?platform=pinterest&success=false&error=' + encodeURIComponent('No ad accounts found. Ensure your Pinterest account has Ads access.'), 302)
    }

    // Calculate token expiry (access tokens last ~1hr)
    const expiresAt = new Date(Date.now() + tokenResult.expires_in * 1000)

    // Store each ad account as a social_connection
    for (const acct of adAccounts) {
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
          'pinterest',
          acct.id,
          acct.name,
          tokenResult.access_token,
          tokenResult.refresh_token,
          expiresAt,
          ['ads:read'],
          'active',
          JSON.stringify({
            currency: acct.currency,
            country: acct.country,
            accountStatus: acct.status,
          }),
          user.id
        ]
      )
    }

    return sendRedirect(event, `/auth/oauth-callback?platform=pinterest&success=true&accounts=${adAccounts.length}`, 302)
  } catch (err: any) {
    console.error('[Pinterest Callback] Error:', err.message || err)
    const msg = err.data?.statusMessage || err.message || 'Connection failed'
    return sendRedirect(event, `/auth/oauth-callback?platform=pinterest&success=false&error=${encodeURIComponent(msg)}`, 302)
  }
})
