/**
 * Client Portal Logout
 * POST /api/portal/auth/logout
 */

import { queryRowsFresh, execute } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const sessionToken = getCookie(event, 'client_session_token')

  if (sessionToken) {
    try {
      const sessionDigest = await digestPortalSessionToken(sessionToken)
      const deleted = await execute(`
        DELETE FROM client_sessions
        WHERE token_hash = $1
      `, [sessionDigest])

      if (deleted === 0) {
        const legacySessions = await queryRowsFresh(`
          SELECT id, token_hash
          FROM client_sessions
          WHERE expires_at > NOW()
            AND token_hash LIKE '$2%'
          ORDER BY created_at DESC
          LIMIT 100
        `)

        for (const session of legacySessions) {
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
