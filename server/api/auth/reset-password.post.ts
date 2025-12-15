/**
 * Reset Password
 * POST /api/auth/reset-password
 */

import { queryOne } from '~~/server/utils/db'
import { hashPassword, hashToken, invalidateAllSessions, logActivity } from '~~/server/utils/auth'

interface ResetPasswordBody {
  token: string
  password: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ResetPasswordBody>(event)

  if (!body.token || !body.password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Token and password are required'
    })
  }

  if (body.password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters'
    })
  }

  try {
    const tokenHash = hashToken(body.token)

    // Find valid token
    const resetToken = await queryOne(`
      SELECT prt.id, prt.user_id, u.name, u.email
      FROM password_reset_tokens prt
      JOIN team_members u ON prt.user_id = u.id
      WHERE prt.token_hash = $1 AND prt.expires_at > NOW() AND prt.used_at IS NULL
    `, [tokenHash])

    if (!resetToken) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid or expired reset token'
      })
    }

    // Hash new password
    const passwordHash = await hashPassword(body.password)

    // Update password
    await queryOne(`
      UPDATE team_members
      SET password_hash = $1, updated_at = NOW()
      WHERE id = $2
    `, [passwordHash, resetToken.user_id])

    // Mark token as used
    await queryOne(`
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE id = $1
    `, [resetToken.id])

    // Invalidate all existing sessions (force re-login)
    await invalidateAllSessions(resetToken.user_id)

    // Log activity
    await logActivity({
      userId: resetToken.user_id,
      action: 'password_reset',
      resourceType: 'user',
      resourceId: resetToken.user_id,
      event
    })

    return {
      success: true,
      message: 'Password has been reset. Please log in with your new password.'
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Password reset error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to reset password'
    })
  }
})
