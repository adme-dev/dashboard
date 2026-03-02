/**
 * Verify a magic link token and create session
 * GET /api/auth/magic-link/verify?token=xxx
 */

import { getQuery, createError, setCookie, getRequestURL } from 'h3'
import { verifyMagicLink, createJwt } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { token } = query

  console.log('[Magic Link Verify] Token:', token ? token.substring(0, 10) + '...' : 'none')

  if (!token || typeof token !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Token is required'
    })
  }

  try {
    // Verify the magic link token
    const user = await verifyMagicLink(token)
    console.log('[Magic Link Verify] User:', user ? { id: user.id, email: user.email } : null)

    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid or expired magic link'
      })
    }

    // Create JWT session
    const jwtToken = await createJwt({
      userId: user.id,
      email: user.email,
      role: user.role
    })

    // Secure cookies on HTTPS (CF Pages is always HTTPS; localhost is HTTP)
    const isSecure = getRequestURL(event).protocol === 'https:'
    const cookieOpts = {
      secure: isSecure,
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    }

    // Main auth token (httpOnly for security)
    setCookie(event, 'auth_token', jwtToken, { ...cookieOpts, httpOnly: true })

    // Client-visible cookie for detection
    setCookie(event, 'auth_status', 'logged_in', { ...cookieOpts, httpOnly: false })

    // Client-accessible token for fallback (NOT httpOnly)
    setCookie(event, 'auth_token_client', jwtToken, { ...cookieOpts, httpOnly: false })

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      token: jwtToken // Send token in response for localStorage fallback
    }
  } catch (error: any) {
    console.error('[Magic Link Verify] Error:', error)
    if (error.statusCode) throw error
    
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid or expired magic link'
    })
  }
})
