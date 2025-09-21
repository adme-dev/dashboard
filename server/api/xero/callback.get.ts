import { $fetch } from 'ofetch'
import { setTokenForSession, type XeroTokenSet } from '../../utils/tokenStore'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig()
  const clientId = config.xeroClientId
  const clientSecret = config.xeroClientSecret
  const redirectUri = config.xeroRedirectUri

  const query = getQuery(event)
  const code = String(query.code || '')
  const state = String(query.state || '')
  const expectedState = getCookie(event, 'xero_oauth_state')

  if (!clientId || !clientSecret || !redirectUri) {
    throw createError({ statusCode: 500, statusMessage: 'Xero OAuth not configured' })
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid OAuth state or code' })
  }

  deleteCookie(event, 'xero_oauth_state', { path: '/' })

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret
  })

  const tokenResponse = await $fetch<any>('https://identity.xero.com/connect/token', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })

  const expiresAt = Date.now() + (tokenResponse.expires_in || 0) * 1000
  const tokenSet: XeroTokenSet = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: expiresAt,
    scope: tokenResponse.scope,
    token_type: tokenResponse.token_type
  }

  await setTokenForSession(event, tokenSet)

  return sendRedirect(event, '/settings', 302)
})
