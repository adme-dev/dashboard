import { setCookie, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getPinterestAuthUrl } from '~~/server/utils/pinterestClient'

/**
 * GET /api/agency/social/pinterest/connect
 * Generates Pinterest OAuth URL and returns it for frontend redirect/popup
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const config = useRuntimeConfig()
  if (!config.pinterestAppId || !config.pinterestAppSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Pinterest app credentials not configured' })
  }

  // Generate CSRF state
  const state = crypto.randomUUID()

  // Store state in httpOnly cookie (10 min expiry)
  setCookie(event, 'pinterest_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10
  })

  // Build absolute redirect URI from incoming request
  const reqUrl = getRequestURL(event)
  const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
  const redirectUri = config.pinterestRedirectUri.startsWith('http')
    ? config.pinterestRedirectUri
    : `${publicUrl}${config.pinterestRedirectUri}`

  const url = getPinterestAuthUrl(config.pinterestAppId, redirectUri, state)

  return { url }
})
