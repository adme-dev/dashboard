/**
 * Change Password
 * PUT /api/auth/password
 */

import { queryOne, query } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import bcrypt from 'bcryptjs'

interface ChangePasswordBody {
  currentPassword: string
  newPassword: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<ChangePasswordBody>(event)

  if (!body.currentPassword || !body.newPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Current password and new password are required'
    })
  }

  // Validate new password strength
  if (body.newPassword.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'New password must be at least 8 characters long'
    })
  }

  // Get current password hash
  const userData = await queryOne(
    'SELECT password_hash FROM team_members WHERE id = $1',
    [user.id]
  )

  if (!userData?.password_hash) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot change password for this account type'
    })
  }

  // Verify current password
  const isValid = await bcrypt.compare(body.currentPassword, userData.password_hash)
  if (!isValid) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Current password is incorrect'
    })
  }

  // Hash new password
  const salt = await bcrypt.genSalt(12)
  const newPasswordHash = await bcrypt.hash(body.newPassword, salt)

  // Update password
  await query(
    'UPDATE team_members SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [newPasswordHash, user.id]
  )

  // Optionally: Invalidate other sessions (would require session management)
  // For now, we'll just return success

  return {
    success: true,
    message: 'Password changed successfully'
  }
})
