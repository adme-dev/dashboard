import { sendRedirect, setCookie } from 'h3'
import { buildXeroConsentUrl } from '../../utils/xeroClient'

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const state = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2)

  const authorizeUrl = await buildXeroConsentUrl({ state, event })

  // Save state for CSRF protection
  setCookie(event, 'xero_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10 // 10 minutes
  })

  if (query.mode === 'popup') {
    setCookie(event, 'xero_oauth_mode', 'popup', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 10
    })
  }

  return sendRedirect(event, authorizeUrl, 302)
})
