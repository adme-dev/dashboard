import { createError, deleteCookie, getCookie, getQuery, getRequestURL, sendRedirect } from 'h3'
import { ofetch } from 'ofetch'
import { query } from '~~/server/utils/db'
import { requireHrAdmin } from '~~/server/utils/hr/authorization'
import { validateMondayToken } from '~~/server/utils/mondayClient'
import { getMondayOAuthValue, MONDAY_OAUTH_CALLBACK_PATH, MONDAY_OAUTH_SCOPES, MONDAY_OAUTH_STATE_COOKIE } from '~~/server/utils/mondayOAuth'

/** Monday OAuth callback. Secrets are server-only; tokens are never returned to the browser. */
export default eventHandler(async (event) => {
  const user = await requireHrAdmin(event)
  const queryParams = getQuery(event)
  const code = typeof queryParams.code === 'string' ? queryParams.code : ''
  const state = typeof queryParams.state === 'string' ? queryParams.state : ''
  const expectedState = getCookie(event, MONDAY_OAUTH_STATE_COOKIE) || ''

  if (!code || !state || !expectedState || state !== expectedState) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid Monday OAuth state or code' })
  }
  deleteCookie(event, MONDAY_OAUTH_STATE_COOKIE, { path: '/api/agency/monday/oauth/callback' })

  const clientId = getMondayOAuthValue(event, 'MONDAY_OAUTH_CLIENT_ID')
  const clientSecret = getMondayOAuthValue(event, 'MONDAY_OAUTH_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw createError({ statusCode: 503, statusMessage: 'Monday OAuth is not configured' })
  }

  const tokenResponse = await ofetch<{ access_token?: string }>('https://auth.monday.com/oauth2/token', {
    method: 'POST',
    body: { code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${getRequestURL(event).origin}${MONDAY_OAUTH_CALLBACK_PATH}` },
  })
  const token = tokenResponse.access_token
  if (!token) throw createError({ statusCode: 502, statusMessage: 'Monday did not return an access token' })

  const validation = await validateMondayToken(token)
  if (!validation.valid || !validation.account) {
    throw createError({ statusCode: 502, statusMessage: 'Monday OAuth token validation failed' })
  }

  await query(`
    INSERT INTO integration_configs (integration_type, access_token, account_id, account_name, connected_by, connected_at, settings)
    VALUES ('monday', $1, $2, $3, $4, NOW(), $5)
    ON CONFLICT (integration_type) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      account_id = EXCLUDED.account_id,
      account_name = EXCLUDED.account_name,
      connected_by = EXCLUDED.connected_by,
      connected_at = EXCLUDED.connected_at,
      settings = COALESCE(integration_configs.settings, '{}'::jsonb) || EXCLUDED.settings
  `, [token, validation.account.id, validation.account.name, user.id, JSON.stringify({ authMethod: 'oauth', scopes: [...MONDAY_OAUTH_SCOPES] })])

  return sendRedirect(event, '/agency/monday?connected=oauth', 302)
})
