/**
 * Resend Email Verification
 * POST /api/auth/resend-verification
 */

import { queryOne, query } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { sendVerificationEmail } from '~~/server/utils/email'
import { randomBytes } from 'crypto'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // Check if already verified
  if (user.email_verified_at) {
    return {
      success: true,
      message: 'Email already verified'
    }
  }

  try {
    // Invalidate existing tokens
    await query(`
      UPDATE email_verification_tokens
      SET used_at = NOW()
      WHERE user_id = $1 AND used_at IS NULL
    `, [user.id])

    // Create new verification token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await query(`
      INSERT INTO email_verification_tokens (user_id, token, expires_at)
      VALUES ($1, $2, $3)
    `, [user.id, token, expiresAt])

    // Send verification email
    await sendVerificationEmail({
      to: user.email,
      name: user.name,
      token
    })

    return {
      success: true,
      message: 'Verification email sent'
    }
  } catch (error) {
    console.error('Failed to resend verification:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to send verification email'
    })
  }
})
