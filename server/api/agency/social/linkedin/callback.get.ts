import { getCookie, deleteCookie, sendRedirect, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  exchangeLinkedInToken,
  getLinkedInAdAccounts
} from '~~/server/utils/linkedinClient'

/**
 * GET /api/agency/social/linkedin/callback
 * OAuth callback — exchanges code for token, fetches ad accounts, stores in social_connections.
 * LinkedIn sends `code` in query params. Tokens expire in ~60 days.
 */
export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)

    const code = String(query.code || '')
    const state = String(query.state || '')
    const expectedState = getCookie(event, 'linkedin_oauth_state')

    if (!code || !state || !expectedState || state !== expectedState) {
      return sendRedirect(event, '/auth/oauth-callback?platform=linkedin&success=false&error=' + encodeURIComponent('Invalid OAuth state. Please try again.'), 302)
    }

    deleteCookie(event, 'linkedin_oauth_state', { path: '/' })

    const config = useRuntimeConfig()

    // Build absolute redirect URI (must match the one used in connect.get.ts)
    const reqUrl = getRequestURL(event)
    const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
    const redirectUri = config.linkedinRedirectUri.startsWith('http')
      ? config.linkedinRedirectUri
      : `${publicUrl}${config.linkedinRedirectUri}`

    // Exchange code for access token
    const tokenResult = await exchangeLinkedInToken(
      code,
      config.linkedinClientId,
      config.linkedinClientSecret,
      redirectUri
    )

    // Fetch ad account details
    let adAccounts: Awaited<ReturnType<typeof getLinkedInAdAccounts>> = []
    try {
      adAccounts = await getLinkedInAdAccounts(tokenResult.access_token)
    } catch (err: any) {
      console.warn('[LinkedIn Callback] Could not fetch ad accounts:', err.message)
    }

    if (adAccounts.length === 0) {
      return sendRedirect(event, '/auth/oauth-callback?platform=linkedin&success=false&error=' + encodeURIComponent('No ad accounts found. Ensure your LinkedIn account has advertising access.'), 302)
    }

    // Calculate token expiry
    const tokenExpiresAt = new Date(Date.now() + tokenResult.expires_in * 1000)

    // Store each ad account as a social_connection
    for (const acct of adAccounts) {
      await queryOne(
        `INSERT INTO social_connections (platform, account_id, account_name, access_token, refresh_token, token_expires_at, scopes, status, metadata, connected_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (platform, account_id)
         DO UPDATE SET
           access_token = EXCLUDED.access_token,
           refresh_token = COALESCE(EXCLUDED.refresh_token, social_connections.refresh_token),
           token_expires_at = EXCLUDED.token_expires_at,
           scopes = EXCLUDED.scopes,
           status = 'active',
           metadata = EXCLUDED.metadata,
           connected_by = EXCLUDED.connected_by,
           updated_at = NOW()
         RETURNING id`,
        [
          'linkedin',
          acct.id,
          acct.name,
          tokenResult.access_token,
          tokenResult.refresh_token || null,
          tokenExpiresAt,
          ['r_ads', 'r_ads_reporting'],
          'active',
          JSON.stringify({
            currency: acct.currency,
            accountStatus: acct.status,
          }),
          user.id
        ]
      )
    }

    return sendRedirect(event, `/auth/oauth-callback?platform=linkedin&success=true&accounts=${adAccounts.length}`, 302)
  } catch (err: any) {
    console.error('[LinkedIn Callback] Error:', err.message || err)
    const msg = err.data?.statusMessage || err.message || 'Connection failed'
    return sendRedirect(event, `/auth/oauth-callback?platform=linkedin&success=false&error=${encodeURIComponent(msg)}`, 302)
  }
})
