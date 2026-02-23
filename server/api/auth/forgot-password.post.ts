/**
 * Request Password Reset
 * POST /api/auth/forgot-password
 */

import { queryOne } from '~~/server/utils/db'
import { generateToken, hashToken, logActivity } from '~~/server/utils/auth'
import { sendPasswordResetEmail } from '~~/server/utils/email'

interface ForgotPasswordBody {
  email: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ForgotPasswordBody>(event)

  if (!body.email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required'
    })
  }

  const email = body.email.toLowerCase().trim()

  try {
    // Always return success to prevent email enumeration
    const successResponse = {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    }

    // Find user
    const user = await queryOne(
      'SELECT id, name, email, is_active FROM team_members WHERE email = $1',
      [email]
    )

    // If no user or inactive, still return success
    if (!user || !user.is_active) {
      return successResponse
    }

    // Delete any existing reset tokens for this user
    await queryOne('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id])

    // Create new reset token
    const token = generateToken()
    const tokenHash = await hashToken(token)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await queryOne(`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `, [user.id, tokenHash, expiresAt])

    // Send email
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      token,
      expiresAt
    })

    // Log activity
    await logActivity({
      userId: user.id,
      action: 'password_reset_requested',
      resourceType: 'user',
      resourceId: user.id,
      event
    })

    return successResponse
  } catch (error) {
    console.error('Password reset request error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to process password reset request'
    })
  }
})
