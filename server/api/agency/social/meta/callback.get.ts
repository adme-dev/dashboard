import { getCookie, deleteCookie, sendRedirect } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  exchangeMetaCode,
  exchangeForLongLivedToken,
  getAdAccounts
} from '~~/server/utils/metaClient'

/**
 * GET /api/agency/social/meta/callback
 * OAuth callback — exchanges code for long-lived token, stores ad accounts.
 * IMPORTANT: Every code path must redirect to /auth/oauth-callback so the
 * popup can communicate the result back to the opener window.
 */
export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)

    const code = String(query.code || '')
    const state = String(query.state || '')
    const errorParam = String(query.error || '')
    const expectedState = getCookie(event, 'meta_oauth_state')

    // User denied permission or Meta returned an error
    if (errorParam) {
      const errorReason = String(query.error_reason || query.error_description || errorParam)
      return sendRedirect(event, `/auth/oauth-callback?platform=meta&success=false&error=${encodeURIComponent(errorReason)}`, 302)
    }

    if (!code || !state || !expectedState || state !== expectedState) {
      return sendRedirect(event, '/auth/oauth-callback?platform=meta&success=false&error=' + encodeURIComponent('Invalid OAuth state. Please try again.'), 302)
    }

    deleteCookie(event, 'meta_oauth_state', { path: '/' })

    const config = useRuntimeConfig()
    const publicUrl = config.public.appUrl || 'http://localhost:3000'
    const redirectUri = config.metaRedirectUri.startsWith('http')
      ? config.metaRedirectUri
      : `${publicUrl}${config.metaRedirectUri}`

    // Exchange code for short-lived token
    const shortToken = await exchangeMetaCode(
      code,
      config.metaAppId,
      config.metaAppSecret,
      redirectUri
    )

    // Exchange for long-lived token (~60 days)
    const longToken = await exchangeForLongLivedToken(
      shortToken.access_token,
      config.metaAppId,
      config.metaAppSecret
    )

    const expiresAt = longToken.expires_in
      ? new Date(Date.now() + longToken.expires_in * 1000)
      : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // default 60 days

    // Fetch ad accounts
    const adAccounts = await getAdAccounts(longToken.access_token)

    // Store each ad account as a social_connection
    for (const account of adAccounts) {
      await queryOne(
        `INSERT INTO social_connections (platform, account_id, account_name, access_token, token_expires_at, scopes, status, metadata, connected_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (platform, account_id)
         DO UPDATE SET
           access_token = EXCLUDED.access_token,
           token_expires_at = EXCLUDED.token_expires_at,
           scopes = EXCLUDED.scopes,
           status = 'active',
           metadata = EXCLUDED.metadata,
           connected_by = EXCLUDED.connected_by,
           updated_at = NOW()
         RETURNING id`,
        [
          'meta',
          account.account_id,
          account.name,
          longToken.access_token,
          expiresAt,
          ['ads_read'],
          'active',
          JSON.stringify({
            actId: account.id,
            currency: account.currency,
            accountStatus: account.account_status,
            businessName: account.business_name || null
          }),
          user.id
        ]
      )
    }

    return sendRedirect(event, `/auth/oauth-callback?platform=meta&success=true&accounts=${adAccounts.length}`, 302)
  } catch (err: any) {
    console.error('[Meta Callback] Error:', err.message || err)
    const msg = err.data?.statusMessage || err.data?.error?.message || err.message || 'Connection failed'
    return sendRedirect(event, `/auth/oauth-callback?platform=meta&success=false&error=${encodeURIComponent(msg)}`, 302)
  }
})
