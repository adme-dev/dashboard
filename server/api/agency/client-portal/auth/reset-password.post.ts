/**
 * Request Password Reset
 * POST /api/agency/client-portal/auth/reset-password
 *
 * Body:
 * - email: User email
 */

import { queryOne } from '~~/server/utils/db'
import { sendPasswordResetEmail } from '~~/server/utils/email'

// Client-specific password reset using the existing email function
async function sendClientPasswordResetEmail(params: {
  to: string
  userName: string
  clientName: string
  resetToken: string
  expiresAt: Date
}) {
  return sendPasswordResetEmail({
    to: params.to,
    name: params.userName,
    token: params.resetToken,
    expiresAt: params.expiresAt
  })
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email } = body

  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required'
    })
  }

  try {
    // Find user
    const user = await queryOne(`
      SELECT
        cu.id,
        cu.email,
        cu.name,
        cu.status,
        c.name as client_name
      FROM client_users cu
      JOIN agency_clients c ON cu.client_id = c.id
      WHERE cu.email = $1
    `, [email.toLowerCase()])

    // Always return success to avoid email enumeration
    if (!user || user.status !== 'active') {
      return {
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      }
    }

    // Generate reset token
    const resetToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 1) // 1 hour expiry

    // Store reset token (using invitations table with special status)
    await queryOne(`
      INSERT INTO client_invitations (
        client_id,
        email,
        name,
        token,
        status,
        expires_at
      )
      SELECT
        cu.client_id,
        cu.email,
        cu.name,
        $1,
        'pending',
        $2
      FROM client_users cu
      WHERE cu.id = $3
      ON CONFLICT (client_id, email) DO UPDATE SET
        token = $1,
        status = 'pending',
        expires_at = $2
      RETURNING id
    `, [resetToken, expiresAt.toISOString(), user.id])

    // Send reset email
    try {
      await sendClientPasswordResetEmail({
        to: user.email,
        userName: user.name,
        clientName: user.client_name,
        resetToken,
        expiresAt
      })
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError)
    }

    return {
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.'
    }
  } catch (error: any) {
    console.error('Password reset request failed:', error)
    // Still return success to avoid enumeration
    return {
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.'
    }
  }
})
