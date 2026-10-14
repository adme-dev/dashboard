import { setCookie, sendRedirect } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getGa4AuthUrl } from '~~/server/utils/ga4Client'
import { GA4_CALLBACK_PATH, buildGoogleOAuthRedirectUri, resolveGoogleOAuthRuntimeConfig } from '~~/server/utils/googleOAuthRuntimeConfig'

/**
 * GET /api/agency/social/ga4/connect
 * Returns a read-only Google OAuth URL. Explicit purpose=key_events requests edit access.
 * redirect=1 starts consent directly for staff following a setup link.
 */
export default eventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])

  const query = getQuery(event)
  const purpose = query.purpose ?? 'reporting'
  if (purpose !== 'reporting' && purpose !== 'key_events') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid GA4 connection purpose' })
  }
  if (query.redirect !== undefined && query.redirect !== '1') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid GA4 redirect option' })
  }

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

  const url = getGa4AuthUrl(config.googleClientId, redirectUri, state, {
    manageKeyEvents: purpose === 'key_events'
  })
  return query.redirect === '1' ? sendRedirect(event, url, 302) : { url }
})
