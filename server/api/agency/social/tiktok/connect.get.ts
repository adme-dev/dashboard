import { setCookie, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getTikTokAuthUrl } from '~~/server/utils/tiktokClient'

/**
 * GET /api/agency/social/tiktok/connect
 * Generates TikTok OAuth URL and returns it for frontend redirect/popup
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const config = useRuntimeConfig()
  if (!config.tiktokAppId || !config.tiktokAppSecret) {
    throw createError({ statusCode: 500, statusMessage: 'TikTok app credentials not configured' })
  }

  // Generate CSRF state
  const state = crypto.randomUUID()

  // Store state in httpOnly cookie (10 min expiry)
  setCookie(event, 'tiktok_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10
  })

  // Always derive the redirect URI from the incoming request host so it
  // matches the current environment (localhost, preview, production). If the
  // env var happens to be an absolute URL, only its pathname is kept.
  const reqUrl = getRequestURL(event)
  const configured = config.tiktokRedirectUri
  const callbackPath = configured.startsWith('http') ? new URL(configured).pathname : configured
  const redirectUri = `${reqUrl.protocol}//${reqUrl.host}${callbackPath}`

  const url = getTikTokAuthUrl(config.tiktokAppId, redirectUri, state)

  return { url }
})
