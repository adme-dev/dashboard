import { setCookie, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getGoogleAuthUrl } from '~~/server/utils/googleAdsClient'

/**
 * GET /api/agency/social/google/connect
 * Generates Google OAuth URL and returns it for frontend redirect/popup
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const config = useRuntimeConfig()
  if (!config.googleClientId || !config.googleClientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Google Ads credentials not configured' })
  }

  // Generate CSRF state
  const state = crypto.randomUUID()

  // Store state in httpOnly cookie (10 min expiry)
  setCookie(event, 'google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10
  })

  // Build absolute redirect URI from incoming request
  const reqUrl = getRequestURL(event)
  const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
  const redirectUri = config.googleRedirectUri.startsWith('http')
    ? config.googleRedirectUri
    : `${publicUrl}${config.googleRedirectUri}`

  const url = getGoogleAuthUrl(config.googleClientId, redirectUri, state)

  return { url }
})
