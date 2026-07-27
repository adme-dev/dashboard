/**
 * Client Portal Logout
 * POST /api/portal/auth/logout
 */

import { execute } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'

export default defineEventHandler(async (event) => {
  const sessionToken = getCookie(event, 'client_session_token')

  if (sessionToken) {
    try {
      const sessionDigest = await digestPortalSessionToken(sessionToken)
      await execute(`
        DELETE FROM client_sessions
        WHERE token_hash = $1
      `, [sessionDigest])
    } catch (error) {
      console.error('Logout session cleanup failed:', error)
    }
  }

  // Always clear cookie
  deleteCookie(event, 'client_session_token', { path: '/' })

  return {
    success: true,
    message: 'Logged out successfully'
  }
})
