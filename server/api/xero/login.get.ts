import { sendRedirect, setCookie } from 'h3'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig()
  const clientId = config.xeroClientId
  const redirectUri = config.xeroRedirectUri

  if (!clientId || !redirectUri) {
    throw createError({ statusCode: 500, statusMessage: 'Xero OAuth not configured' })
  }

  const state = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2)

  // Save state for CSRF protection
  setCookie(event, 'xero_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10 // 10 minutes
  })

  const scope = [
    'offline_access',
    'accounting.reports.read',
    'accounting.settings.read',
    'accounting.transactions.read',
    'accounting.contacts.read'
  ].join(' ')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state
  })

  const authorizeUrl = `https://login.xero.com/identity/connect/authorize?${params.toString()}`
  return sendRedirect(event, authorizeUrl, 302)
})
