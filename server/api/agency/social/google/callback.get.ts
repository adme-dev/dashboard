import { getCookie, deleteCookie, sendRedirect, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import {
  exchangeGoogleCode,
  listAccessibleCustomers,
  getCustomerInfo,
  listClientAccounts
} from '~~/server/utils/googleAdsClient'

/**
 * GET /api/agency/social/google/callback
 * OAuth callback — exchanges code for tokens, stores customer accounts.
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
    const expectedState = getCookie(event, 'google_oauth_state')

    // User denied permission or Google returned an error
    if (errorParam) {
      const errorDesc = String(query.error_description || errorParam)
      return sendRedirect(event, `/auth/oauth-callback?platform=google&success=false&error=${encodeURIComponent(errorDesc)}`, 302)
    }

    if (!code || !state || !expectedState || state !== expectedState) {
      return sendRedirect(event, '/auth/oauth-callback?platform=google&success=false&error=' + encodeURIComponent('Invalid OAuth state. Please try again.'), 302)
    }

    deleteCookie(event, 'google_oauth_state', { path: '/' })

    const config = useRuntimeConfig()
    const reqUrl = getRequestURL(event)
    const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
    const redirectUri = config.googleRedirectUri.startsWith('http')
      ? config.googleRedirectUri
      : `${publicUrl}${config.googleRedirectUri}`

    // Exchange code for tokens (includes refresh_token because we used prompt=consent)
    const tokens = await exchangeGoogleCode(
      code,
      config.googleClientId,
      config.googleClientSecret,
      redirectUri
    )

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : new Date(Date.now() + 60 * 60 * 1000) // default 1 hour

    // List accessible customer accounts
    const customerIds = await listAccessibleCustomers(
      tokens.access_token,
      config.googleDeveloperToken
    )

    let storedCount = 0

    // Collect all ad accounts: try each accessible customer as MCC first, then as direct account
    const allAccounts: Array<{ customerId: string; name: string; currencyCode: string; descriptiveName?: string | null }> = []
    const seen = new Set<string>()

    for (const customerId of customerIds) {
      // Try as MCC — list child accounts
      try {
        const children = await listClientAccounts(customerId, tokens.access_token, config.googleDeveloperToken)
        if (children.length > 0) {
          for (const child of children) {
            if (!seen.has(child.customerId)) {
              seen.add(child.customerId)
              allAccounts.push(child)
            }
          }
          continue
        }
      } catch {
        // Not an MCC or no access — try as direct account
      }

      // Try as direct ad account
      try {
        const info = await getCustomerInfo(customerId, tokens.access_token, config.googleDeveloperToken)
        if (info && !seen.has(info.customerId)) {
          seen.add(info.customerId)
          allAccounts.push(info)
        }
      } catch (err: any) {
        console.error(`[GoogleAds] Failed to get info for customer ${customerId}:`, err.message)
      }
    }

    // Store all accounts
    for (const account of allAccounts) {
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
          'google',
          account.customerId,
          account.name,
          tokens.access_token,
          tokens.refresh_token || null,
          expiresAt,
          ['https://www.googleapis.com/auth/adwords'],
          'active',
          JSON.stringify({
            currencyCode: account.currencyCode,
            descriptiveName: account.descriptiveName || null
          }),
          user.id
        ]
      )
      storedCount++
    }

    return sendRedirect(event, `/auth/oauth-callback?platform=google&success=true&accounts=${storedCount}`, 302)
  } catch (err: any) {
    console.error('[Google Callback] Error:', err.message || err)
    const msg = err.data?.statusMessage || err.data?.error?.message || err.message || 'Connection failed'
    return sendRedirect(event, `/auth/oauth-callback?platform=google&success=false&error=${encodeURIComponent(msg)}`, 302)
  }
})
