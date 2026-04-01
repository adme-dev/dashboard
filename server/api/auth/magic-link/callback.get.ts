/**
 * Server-side magic link callback — verifies token, sets cookies, and redirects.
 * GET /api/auth/magic-link/callback?token=xxx
 *
 * This endpoint handles the entire auth flow in a single HTTP response,
 * eliminating XHR cookie-setting issues. The browser receives Set-Cookie
 * headers directly on the redirect response, guaranteeing they're stored
 * before the next page load.
 */

import { getQuery, setCookie, getRequestURL, sendRedirect } from 'h3'
import { verifyMagicLink, createJwt } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string
  const redirect = (query.redirect as string) || '/agency'

  // Only allow internal redirects (prevent open redirect)
  const safeRedirect = redirect.startsWith('/') ? redirect : '/agency'

  if (!token) {
    console.error('[Magic Link Callback] No token in query string')
    return sendRedirect(event, '/auth/login?error=missing-token', 302)
  }

  try {
    const user = await verifyMagicLink(token)

    if (!user) {
      console.error('[Magic Link Callback] verifyMagicLink returned null — see diagnostic log above')
      return sendRedirect(event, '/auth/login?error=magic-link-expired', 302)
    }

    // Create JWT
    const jwtToken = await createJwt({
      userId: user.id,
      email: user.email,
      role: user.role
    })

    // Cookie options
    const isSecure = getRequestURL(event).protocol === 'https:'
    const cookieOpts = {
      secure: isSecure,
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    }

    // Set all three auth cookies on the redirect response
    setCookie(event, 'auth_token', jwtToken, { ...cookieOpts, httpOnly: true })
    setCookie(event, 'auth_status', 'logged_in', { ...cookieOpts, httpOnly: false })
    setCookie(event, 'auth_token_client', jwtToken, { ...cookieOpts, httpOnly: false })

    // 302 redirect — browser stores cookies from this response, then navigates
    return sendRedirect(event, safeRedirect, 302)
  } catch (error: any) {
    console.error('[Magic Link Callback] Error:', error)
    return sendRedirect(event, '/auth/login?error=magic-link-expired', 302)
  }
})
