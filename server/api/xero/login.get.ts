import { sendRedirect, setCookie, getQuery } from 'h3'
import { createXeroClient } from '../../utils/xeroClient'

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const state = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2)

  const client = await createXeroClient({ state, event })
  const authorizeUrl = await client.buildConsentUrl()

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

    const popupUrl = new URL(authorizeUrl)
    popupUrl.searchParams.set('state', state)
    return sendRedirect(event, popupUrl.toString(), 302)
  }

  return sendRedirect(event, authorizeUrl, 302)
})
