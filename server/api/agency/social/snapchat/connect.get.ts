import { setCookie, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getSnapchatAuthUrl } from '~~/server/utils/snapchatClient'

/**
 * GET /api/agency/social/snapchat/connect
 * Generates Snapchat OAuth URL and returns it for frontend redirect/popup
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const config = useRuntimeConfig()
  if (!config.snapchatClientId || !config.snapchatClientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Snapchat app credentials not configured' })
  }

  // Generate CSRF state
  const state = crypto.randomUUID()

  // Store state in httpOnly cookie (10 min expiry)
  setCookie(event, 'snapchat_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10
  })

  // Build absolute redirect URI from incoming request
  const reqUrl = getRequestURL(event)
  const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
  const redirectUri = config.snapchatRedirectUri.startsWith('http')
    ? config.snapchatRedirectUri
    : `${publicUrl}${config.snapchatRedirectUri}`

  const url = getSnapchatAuthUrl(config.snapchatClientId, redirectUri, state)

  return { url }
})
