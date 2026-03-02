import { getCookie, deleteCookie, sendRedirect, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  exchangeSnapchatToken,
  getSnapchatOrganizations,
  getSnapchatAdAccounts
} from '~~/server/utils/snapchatClient'

/**
 * GET /api/agency/social/snapchat/callback
 * OAuth callback — exchanges code for tokens, fetches orgs → ad accounts, stores connections.
 * Snapchat access tokens last only 30 minutes — we store refresh_token for later refresh.
 */
export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)

    const code = String(query.code || '')
    const state = String(query.state || '')
    const expectedState = getCookie(event, 'snapchat_oauth_state')

    if (!code || !state || !expectedState || state !== expectedState) {
      return sendRedirect(event, '/auth/oauth-callback?platform=snapchat&success=false&error=' + encodeURIComponent('Invalid OAuth state. Please try again.'), 302)
    }

    deleteCookie(event, 'snapchat_oauth_state', { path: '/' })

    const config = useRuntimeConfig()

    // Build absolute redirect URI (must match what was used in the authorize request)
    const reqUrl = getRequestURL(event)
    const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
    const redirectUri = config.snapchatRedirectUri.startsWith('http')
      ? config.snapchatRedirectUri
      : `${publicUrl}${config.snapchatRedirectUri}`

    // Exchange code for access + refresh tokens
    const tokenResult = await exchangeSnapchatToken(
      code,
      config.snapchatClientId,
      config.snapchatClientSecret,
      redirectUri
    )

    const tokenExpiresAt = new Date(Date.now() + tokenResult.expires_in * 1000)

    // Fetch organizations first, then ad accounts from each org
    let allAccounts: Array<{
      id: string
      name: string
      currency: string
      status: string
      orgId: string
      orgName: string
    }> = []

    try {
      const orgs = await getSnapchatOrganizations(tokenResult.access_token)

      for (const org of orgs) {
        try {
          const accounts = await getSnapchatAdAccounts(org.id, tokenResult.access_token)
          for (const acct of accounts) {
            allAccounts.push({
              id: acct.id,
              name: acct.name,
              currency: acct.currency,
              status: acct.status,
              orgId: org.id,
              orgName: org.name,
            })
          }
        } catch (err: any) {
          console.warn(`[Snapchat Callback] Could not fetch accounts for org ${org.name}:`, err.message)
        }
      }
    } catch (err: any) {
      console.warn('[Snapchat Callback] Could not fetch organizations:', err.message)
    }

    if (allAccounts.length === 0) {
      return sendRedirect(event, '/auth/oauth-callback?platform=snapchat&success=false&error=' + encodeURIComponent('No ad accounts found. Ensure your Snapchat Business account has ad accounts.'), 302)
    }

    // Store each ad account as a social_connection
    for (const acct of allAccounts) {
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
          'snapchat',
          acct.id,
          acct.name,
          tokenResult.access_token,
          tokenResult.refresh_token,
          tokenExpiresAt,
          ['snapchat-marketing-api'],
          'active',
          JSON.stringify({
            currency: acct.currency,
            accountStatus: acct.status,
            orgId: acct.orgId,
            orgName: acct.orgName,
          }),
          user.id
        ]
      )
    }

    return sendRedirect(event, `/auth/oauth-callback?platform=snapchat&success=true&accounts=${allAccounts.length}`, 302)
  } catch (err: any) {
    console.error('[Snapchat Callback] Error:', err.message || err)
    const msg = err.data?.statusMessage || err.message || 'Connection failed'
    return sendRedirect(event, `/auth/oauth-callback?platform=snapchat&success=false&error=${encodeURIComponent(msg)}`, 302)
  }
})
