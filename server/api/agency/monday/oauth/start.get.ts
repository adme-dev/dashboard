import { createError, getRequestURL, sendRedirect, setCookie } from 'h3'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import {
  getMondayOAuthValue,
  MONDAY_OAUTH_CALLBACK_PATH,
  MONDAY_OAUTH_SCOPES,
  MONDAY_OAUTH_STATE_COOKIE,
} from '~~/server/utils/mondayOAuth'

/** Begin a least-privilege Monday OAuth flow for an authorised HR administrator. */
export default defineEventHandler(async (event) => {
  await requireHrAdmin(event)
  const clientId = getMondayOAuthValue(event, 'MONDAY_OAUTH_CLIENT_ID')
  if (!clientId) throw createError({ statusCode: 503, statusMessage: 'Monday OAuth is not configured' })

  const state = crypto.randomUUID()
  const requestUrl = getRequestURL(event)
  const redirectUri = `${requestUrl.origin}${MONDAY_OAUTH_CALLBACK_PATH}`
  setCookie(event, MONDAY_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: requestUrl.protocol === 'https:',
    sameSite: 'lax',
    path: MONDAY_OAUTH_CALLBACK_PATH,
    maxAge: 10 * 60,
  })

  const authorizeUrl = new URL('https://auth.monday.com/oauth2/authorize')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('scope', MONDAY_OAUTH_SCOPES.join(' '))
  authorizeUrl.searchParams.set('state', state)
  const versionId = getMondayOAuthValue(event, 'MONDAY_OAUTH_APP_VERSION_ID')
  if (versionId) authorizeUrl.searchParams.set('app_version_id', versionId)

  return sendRedirect(event, authorizeUrl.toString(), 302)
})
