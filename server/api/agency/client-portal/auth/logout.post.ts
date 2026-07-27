/**
 * Client Portal Logout
 * POST /api/agency/client-portal/auth/logout
 *
 * Headers:
 * - Authorization: Bearer <sessionToken>
 */

import { execute } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'

export default defineEventHandler(async (event) => {
  const headers = getHeaders(event)
  const authHeader = headers.authorization
  const cookieToken = getCookie(event, 'client_session_token')
  const sessionToken = cookieToken || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null)

  if (!sessionToken) {
    deleteCookie(event, 'client_session_token', { path: '/' })
    return {
      success: true,
      message: 'Logged out'
    }
  }

  try {
    const sessionDigest = await digestPortalSessionToken(sessionToken)
    await execute(`
      DELETE FROM client_sessions
      WHERE token_hash = $1
    `, [sessionDigest])
  } catch (error) {
    console.error('Logout failed:', error)
  } finally {
    deleteCookie(event, 'client_session_token', { path: '/' })
  }

  return {
    success: true,
    message: 'Logged out successfully'
  }
})
