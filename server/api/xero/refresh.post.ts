import { $fetch } from 'ofetch'
import { getTokenForSession, setTokenForSession, type XeroTokenSet } from '../../utils/tokenStore'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig()
  const clientId = config.xeroClientId
  const clientSecret = config.xeroClientSecret

  if (!clientId || !clientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Xero OAuth not configured' })
  }

  const current = await getTokenForSession(event)
  if (!current?.refresh_token) {
    throw createError({ statusCode: 401, statusMessage: 'No refresh token available' })
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: current.refresh_token,
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
  const next: XeroTokenSet = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token || current.refresh_token,
    expires_at: expiresAt,
    scope: tokenResponse.scope ?? current.scope,
    token_type: tokenResponse.token_type ?? current.token_type
  }

  await setTokenForSession(event, next)

  return { ok: true, expires_at: next.expires_at }
})
