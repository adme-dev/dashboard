import { setCookie, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getGa4AuthUrl } from '~~/server/utils/ga4Client'

/**
 * GET /api/agency/social/ga4/connect
 * Returns a Google OAuth URL scoped for GA4 (analytics.readonly + openid email).
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const config = useRuntimeConfig()
  if (!config.googleClientId || !config.googleClientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Google credentials not configured' })
  }

  const state = crypto.randomUUID()
  setCookie(event, 'ga4_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10
  })

  const reqUrl = getRequestURL(event)
  const configured = config.ga4RedirectUri
  const callbackPath = configured.startsWith('http') ? new URL(configured).pathname : configured
  const redirectUri = `${reqUrl.protocol}//${reqUrl.host}${callbackPath}`

  return { url: getGa4AuthUrl(config.googleClientId, redirectUri, state) }
})
