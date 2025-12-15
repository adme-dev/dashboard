/**
 * Verify Email Address
 * POST /api/auth/verify-email
 */

import { queryOne, query } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { token } = body

  if (!token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Verification token is required'
    })
  }

  try {
    // Find valid verification token
    const verification = await queryOne(`
      SELECT id, user_id, expires_at
      FROM email_verification_tokens
      WHERE token = $1
        AND used_at IS NULL
        AND expires_at > NOW()
    `, [token])

    if (!verification) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid or expired verification token'
      })
    }

    // Mark user as verified and token as used
    await query(`
      UPDATE team_members
      SET email_verified_at = NOW()
      WHERE id = $1 AND email_verified_at IS NULL
    `, [verification.user_id])

    await query(`
      UPDATE email_verification_tokens
      SET used_at = NOW()
      WHERE id = $1
    `, [verification.id])

    return {
      success: true,
      message: 'Email verified successfully'
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Email verification error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to verify email'
    })
  }
})
