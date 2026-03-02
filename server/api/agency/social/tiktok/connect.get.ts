import { setCookie } from 'h3'
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

  // Build absolute redirect URI
  const publicUrl = config.public.appUrl || 'http://localhost:3000'
  const redirectUri = config.tiktokRedirectUri.startsWith('http')
    ? config.tiktokRedirectUri
    : `${publicUrl}${config.tiktokRedirectUri}`

  const url = getTikTokAuthUrl(config.tiktokAppId, redirectUri, state)

  return { url }
})
