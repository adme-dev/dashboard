import { setCookie } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getGa4AuthUrl } from '~~/server/utils/ga4Client'
import { GA4_CALLBACK_PATH, buildGoogleOAuthRedirectUri, resolveGoogleOAuthRuntimeConfig } from '~~/server/utils/googleOAuthRuntimeConfig'

/**
 * GET /api/agency/social/ga4/connect
 * Returns a Google OAuth URL scoped for GA4 (analytics.readonly + openid email).
 */
export default eventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])

  const config = resolveGoogleOAuthRuntimeConfig(event)
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

  const redirectUri = buildGoogleOAuthRedirectUri(event, config.ga4RedirectUri, GA4_CALLBACK_PATH)

  return { url: getGa4AuthUrl(config.googleClientId, redirectUri, state) }
})
