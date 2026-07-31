import { getQuery, sendRedirect } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getGoogleUserInfo } from '~~/server/utils/ga4Client'
import { exchangeGoogleCode } from '~~/server/utils/googleAdsClient'
import { consumeGoogleOAuthAttempt } from '~~/server/utils/googleCredentialProfiles'
import {
  SEARCH_CONSOLE_CALLBACK_PATH,
  buildGoogleOAuthRedirectUri,
  resolveGoogleOAuthRuntimeConfig
} from '~~/server/utils/googleOAuthRuntimeConfig'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { storeSearchConsoleCredentialProfile } from '~~/server/utils/searchAuthority/credentials'

const CALLBACK_RESULT = '/auth/oauth-callback?platform=search-console'
const READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

function callbackRedirect(
  event: Parameters<typeof sendRedirect>[0],
  success: boolean,
  error?: string
) {
  const suffix = error ? `&error=${encodeURIComponent(error)}` : ''
  return sendRedirect(
    event,
    `${CALLBACK_RESULT}&success=${String(success)}${suffix}`,
    302
  )
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Connection failed'
  return error.message.slice(0, 240)
}

export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)
    const state = String(query.state || '')
    if (!state) return callbackRedirect(event, false, 'Invalid OAuth state')

    const attempt = await consumeGoogleOAuthAttempt(state, user.id, {
      purpose: 'search_console'
    })
    const clientId = attempt?.context?.clientId
    if (!attempt || !clientId) {
      return callbackRedirect(event, false, 'Invalid or expired OAuth state')
    }

    const providerError = String(query.error || '')
    if (providerError) {
      return callbackRedirect(
        event,
        false,
        String(query.error_description || providerError)
      )
    }

    const code = String(query.code || '')
    if (!code) return callbackRedirect(event, false, 'Authorization code is missing')
    await requireAgencySearchAuthorityAccess(event, clientId)

    const config = resolveGoogleOAuthRuntimeConfig(event)
    if (!config.googleClientId || !config.googleClientSecret) {
      throw new Error('Google OAuth credentials are not configured')
    }
    const redirectUri = buildGoogleOAuthRedirectUri(
      event,
      config.searchConsoleRedirectUri,
      SEARCH_CONSOLE_CALLBACK_PATH
    )
    const tokens = await exchangeGoogleCode(
      code,
      config.googleClientId,
      config.googleClientSecret,
      redirectUri
    )
    const scopes = String(tokens.scope || '').split(/\s+/).filter(Boolean)
    if (!scopes.includes(READONLY_SCOPE)) {
      throw new Error('Google did not grant Search Console read access')
    }

    const identity = await getGoogleUserInfo(tokens.access_token)
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000)
    await storeSearchConsoleCredentialProfile({
      clientId,
      userId: user.id,
      googleSub: identity.sub,
      email: identity.email,
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt,
        scopes
      }
    })

    return callbackRedirect(event, true)
  } catch (error) {
    console.error('[Search Console OAuth] Connection failed', errorMessage(error))
    return callbackRedirect(event, false, errorMessage(error))
  }
})
