/**
 * Client Portal Logout
 * POST /api/agency/client-portal/auth/logout
 *
 * Headers:
 * - Authorization: Bearer <sessionToken>
 */

import { execute, queryRows } from '~~/server/utils/db'
import bcrypt from 'bcryptjs'

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
    const sessions = await queryRows(`
      SELECT id, token_hash
      FROM client_sessions
      WHERE expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 100
    `)

    for (const session of sessions) {
      try {
        const valid = await bcrypt.compare(sessionToken, session.token_hash)
        if (valid) {
          await execute(`
            DELETE FROM client_sessions
            WHERE id = $1
          `, [session.id])
          break
        }
      } catch {
        continue
      }
    }
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
