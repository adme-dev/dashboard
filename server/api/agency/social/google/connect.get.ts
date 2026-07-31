import { getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getGoogleAuthUrl } from '~~/server/utils/googleAdsClient'
import { createGoogleOAuthAttempt } from '~~/server/utils/googleCredentialProfiles'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

/**
 * GET /api/agency/social/google/connect
 * Generates Google OAuth URL and returns it for frontend redirect/popup
 */
export default eventHandler(async (event) => {
  const user = await requireAuth(event)

  const runtimeConfig = useRuntimeConfig()
  const config = resolveGoogleAdsRuntimeConfig(undefined, event)
  if (!config.googleClientId || !config.googleClientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Google Ads credentials not configured' })
  }

  // Independent, user-bound attempts support concurrent agency login flows.
  const { attemptId, state } = await createGoogleOAuthAttempt(user.id, {
    purpose: 'google_ads'
  })

  // Always derive the redirect URI from the incoming request host so it
  // matches the current environment (localhost, preview, production). If the
  // env var happens to be an absolute URL, only its pathname is kept.
  const reqUrl = getRequestURL(event)
  const configured = runtimeConfig.googleRedirectUri
  const callbackPath = configured.startsWith('http') ? new URL(configured).pathname : configured
  const redirectUri = `${reqUrl.protocol}//${reqUrl.host}${callbackPath}`

  const url = getGoogleAuthUrl(config.googleClientId, redirectUri, state)

  return { url, attemptId }
})
