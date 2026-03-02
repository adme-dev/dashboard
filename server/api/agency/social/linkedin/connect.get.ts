import { setCookie, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getLinkedInAuthUrl } from '~~/server/utils/linkedinClient'

/**
 * GET /api/agency/social/linkedin/connect
 * Generates LinkedIn OAuth URL and returns it for frontend redirect/popup
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const config = useRuntimeConfig()
  if (!config.linkedinClientId || !config.linkedinClientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'LinkedIn app credentials not configured' })
  }

  // Generate CSRF state
  const state = crypto.randomUUID()

  // Store state in httpOnly cookie (10 min expiry)
  setCookie(event, 'linkedin_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10
  })

  // Build absolute redirect URI from incoming request
  const reqUrl = getRequestURL(event)
  const publicUrl = `${reqUrl.protocol}//${reqUrl.host}`
  const redirectUri = config.linkedinRedirectUri.startsWith('http')
    ? config.linkedinRedirectUri
    : `${publicUrl}${config.linkedinRedirectUri}`

  const url = getLinkedInAuthUrl(config.linkedinClientId, redirectUri, state)

  return { url }
})
