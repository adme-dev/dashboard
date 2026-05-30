import { getCookie, deleteCookie, sendRedirect, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { exchangeGoogleCode } from '~~/server/utils/googleAdsClient'
import { getGoogleUserInfo, GA4_SCOPE } from '~~/server/utils/ga4Client'

/**
 * GET /api/agency/social/ga4/callback
 * Exchanges the code, identifies the Google account, and upserts a single
 * platform='ga4' connection row holding the tokens. Property→client mapping
 * happens separately in /ga4/map. Every path redirects to /auth/oauth-callback
 * so the popup can report back.
 */
export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)

    const code = String(query.code || '')
    const state = String(query.state || '')
    const errorParam = String(query.error || '')
    const expectedState = getCookie(event, 'ga4_oauth_state')

    if (errorParam) {
      const desc = String(query.error_description || errorParam)
      return sendRedirect(event, `/auth/oauth-callback?platform=ga4&success=false&error=${encodeURIComponent(desc)}`, 302)
    }
    if (!code || !state || !expectedState || state !== expectedState) {
      return sendRedirect(event, '/auth/oauth-callback?platform=ga4&success=false&error=' + encodeURIComponent('Invalid OAuth state. Please try again.'), 302)
    }
    deleteCookie(event, 'ga4_oauth_state', { path: '/' })

    const config = useRuntimeConfig()
    const reqUrl = getRequestURL(event)
    const configured = config.ga4RedirectUri
    const callbackPath = configured.startsWith('http') ? new URL(configured).pathname : configured
    const redirectUri = `${reqUrl.protocol}//${reqUrl.host}${callbackPath}`

    const tokens = await exchangeGoogleCode(code, config.googleClientId, config.googleClientSecret, redirectUri)
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : new Date(Date.now() + 60 * 60 * 1000)

    const identity = await getGoogleUserInfo(tokens.access_token)

    await queryOne(
      `INSERT INTO social_connections (platform, account_id, account_name, access_token, refresh_token, token_expires_at, scopes, status, metadata, connected_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (platform, account_id)
       DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, social_connections.refresh_token),
         token_expires_at = EXCLUDED.token_expires_at,
         scopes = EXCLUDED.scopes,
         status = 'active',
         account_name = EXCLUDED.account_name,
         connected_by = EXCLUDED.connected_by,
         updated_at = NOW()
       RETURNING id`,
      [
        'ga4',
        identity.sub,
        identity.email,
        tokens.access_token,
        tokens.refresh_token || null,
        expiresAt,
        GA4_SCOPE.split(' '),
        'active',
        JSON.stringify({ email: identity.email }),
        user.id
      ]
    )

    return sendRedirect(event, '/auth/oauth-callback?platform=ga4&success=true', 302)
  } catch (err: any) {
    console.error('[GA4 Callback] Error:', err.message || err)
    const msg = err.data?.error?.message || err.message || 'Connection failed'
    return sendRedirect(event, `/auth/oauth-callback?platform=ga4&success=false&error=${encodeURIComponent(msg)}`, 302)
  }
})
