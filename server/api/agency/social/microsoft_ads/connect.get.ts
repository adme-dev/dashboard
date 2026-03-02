import { setCookie, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getMicrosoftAuthUrl } from '~~/server/utils/microsoftAdsClient'

/**
 * GET /api/agency/social/microsoft_ads/connect
 * Generates Microsoft Ads OAuth URL and returns it for frontend redirect/popup.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const config = useRuntimeConfig()
  if (!config.microsoftAdsClientId || !config.microsoftAdsClientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Microsoft Ads credentials not configured' })
  }

  // Generate CSRF state
  const state = crypto.randomUUID()

  // Store state in httpOnly cookie (10 min expiry)
  setCookie(event, 'microsoft_ads_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10
  })

  // Build absolute redirect URI from incoming request
  const reqUrl = getRequestURL(event)
  const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
  const redirectUri = config.microsoftAdsRedirectUri.startsWith('http')
    ? config.microsoftAdsRedirectUri
    : `${publicUrl}${config.microsoftAdsRedirectUri}`

  const url = getMicrosoftAuthUrl(config.microsoftAdsClientId, redirectUri, state)

  return { url }
})
