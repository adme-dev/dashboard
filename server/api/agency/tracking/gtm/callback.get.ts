import { sendRedirect } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { exchangeGoogleCode } from '~~/server/utils/googleAdsClient'
import { getGoogleUserInfo } from '~~/server/utils/ga4Client'
import { buildGoogleOAuthRedirectUri } from '~~/server/utils/googleOAuthRuntimeConfig'
import { listGtmAccounts, GTM_OAUTH_SCOPES } from '~~/server/utils/googleTagManagerClient'
import { GTM_CALLBACK_PATH, resolveGtmOAuthRuntimeConfig } from '~~/server/utils/googleTagManagerOAuthRuntimeConfig'
import {
  consumeGtmOAuthAttempt,
  reserveGtmApiQuota,
  storeGtmConnection,
} from '~~/server/utils/googleTagManagerStore'

function callbackRedirect(success: boolean, details = ''): string {
  const query = new URLSearchParams({ platform: 'gtm', success: String(success) })
  if (details) query.set(success ? 'connection' : 'error', details)
  return `/auth/oauth-callback?${query.toString()}`
}

export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)
    const state = String(query.state || '')
    const validAttempt = state ? await consumeGtmOAuthAttempt(state, user.id) : false
    if (!validAttempt) return sendRedirect(event, callbackRedirect(false, 'Invalid OAuth state. Please try again.'), 302)

    if (query.error) {
      return sendRedirect(event, callbackRedirect(false, String(query.error_description || query.error)), 302)
    }
    const code = String(query.code || '')
    if (!code) return sendRedirect(event, callbackRedirect(false, 'Google did not return an authorization code.'), 302)

    const config = resolveGtmOAuthRuntimeConfig(event)
    if (!config.googleClientId || !config.googleClientSecret) {
      throw createError({ statusCode: 500, statusMessage: 'Google Tag Manager OAuth credentials are not configured' })
    }
    const redirectUri = buildGoogleOAuthRedirectUri(event, config.googleRedirectUri, GTM_CALLBACK_PATH)
    const tokens = await exchangeGoogleCode(code, config.googleClientId, config.googleClientSecret, redirectUri)
    const identity = await getGoogleUserInfo(tokens.access_token)
    await reserveGtmApiQuota(1)
    const accounts = await listGtmAccounts(tokens.access_token)
    const scopes = tokens.scope
      ? tokens.scope.split(/\s+/).filter(Boolean)
      : [...GTM_OAUTH_SCOPES]
    const stored = await storeGtmConnection({
      userId: user.id,
      identity,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
      scopes,
      accounts: accounts.map(account => ({ path: account.path, name: account.name })),
    })
    return sendRedirect(event, callbackRedirect(true, stored.connectionId), 302)
  } catch (error: any) {
    console.error('[GTM OAuth] Callback failed', {
      code: error?.code || null,
      statusCode: error?.statusCode || null,
      message: String(error?.statusMessage || error?.message || 'Connection failed').slice(0, 500),
    })
    return sendRedirect(
      event,
      callbackRedirect(false, String(error?.statusMessage || error?.message || 'Connection failed').slice(0, 500)),
      302,
    )
  }
})
