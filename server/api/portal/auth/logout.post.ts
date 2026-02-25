/**
 * Client Portal Logout
 * POST /api/portal/auth/logout
 */

import { queryRows, execute } from '~~/server/utils/db'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const sessionToken = getCookie(event, 'client_session_token')

  if (sessionToken) {
    try {
      // Find and delete the matching session
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
              DELETE FROM client_sessions WHERE id = $1
            `, [session.id])
            break
          }
        } catch {
          continue
        }
      }
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
