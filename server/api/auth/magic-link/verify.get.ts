/**
 * Verify a magic link token and create session
 * GET /api/auth/magic-link/verify?token=xxx
 */

import { getQuery, createError, setCookie, getRequestURL } from 'h3'
import { verifyMagicLink, createJwt } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { token } = query

  if (!token || typeof token !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Token is required'
    })
  }

  try {
    const user = await verifyMagicLink(token)

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

    // Set auth cookies on this response
    const isSecure = getRequestURL(event).protocol === 'https:'
    const cookieOpts = {
      secure: isSecure,
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    }

    setCookie(event, 'auth_token', jwtToken, { ...cookieOpts, httpOnly: true })
    setCookie(event, 'auth_status', 'logged_in', { ...cookieOpts, httpOnly: false })
    setCookie(event, 'auth_token_client', jwtToken, { ...cookieOpts, httpOnly: false })

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      token: jwtToken
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
