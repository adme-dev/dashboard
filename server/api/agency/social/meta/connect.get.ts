import { setCookie, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getMetaAuthUrl } from '~~/server/utils/metaClient'

/**
 * GET /api/agency/social/meta/connect
 * Generates Meta OAuth URL and returns it for frontend redirect/popup
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const config = useRuntimeConfig()
  if (!config.metaAppId || !config.metaAppSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Meta app credentials not configured' })
  }

  // Generate CSRF state
  const state = crypto.randomUUID()

  // Store state in httpOnly cookie (10 min expiry)
  setCookie(event, 'meta_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10
  })

  // Build absolute redirect URI from incoming request
  const reqUrl = getRequestURL(event)
  const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
  const redirectUri = config.metaRedirectUri.startsWith('http')
    ? config.metaRedirectUri
    : `${publicUrl}${config.metaRedirectUri}`

  const url = getMetaAuthUrl(config.metaAppId, redirectUri, state)

  return { url }
})
