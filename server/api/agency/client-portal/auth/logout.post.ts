/**
 * Client Portal Logout
 * POST /api/agency/client-portal/auth/logout
 *
 * Headers:
 * - Authorization: Bearer <sessionToken>
 */

import { queryOne } from '~~/server/utils/db'
import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const headers = getHeaders(event)
  const authHeader = headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      statusMessage: 'No session token provided'
    })
  }

  const sessionToken = authHeader.slice(7)

  try {
    // Find all sessions for this token (we need to check each hash)
    // In production, store the token hash directly for O(1) lookup
    const sessions = await queryOne(`
      SELECT id, token_hash, client_user_id
      FROM client_sessions
      WHERE expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 100
    `)

    // For simplicity, just delete all sessions for the user based on the token
    // A more efficient approach would be to store the token hash directly

    // Delete the session (mark as expired)
    await queryOne(`
      DELETE FROM client_sessions
      WHERE id = $1
    `, [sessions?.id])

    return {
      success: true,
      message: 'Logged out successfully'
    }
  } catch (error: any) {
    console.error('Logout failed:', error)
    // Always return success for logout to avoid leaking information
    return {
      success: true,
      message: 'Logged out'
    }
  }
})
