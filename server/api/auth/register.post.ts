/**
 * User Registration
 * POST /api/auth/register
 */

import { queryOne } from '~~/server/utils/db'
import { hashPassword, createSession, generateToken, hashToken, logActivity } from '~~/server/utils/auth'
import { sendWelcomeEmail, sendVerificationEmail } from '~~/server/utils/email'

interface RegisterBody {
  email: string
  password: string
  name: string
  inviteToken?: string // If registering via invitation
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RegisterBody>(event)

  // Validate input
  if (!body.email || !body.password || !body.name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email, password, and name are required'
    })
  }

  if (body.password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters'
    })
  }

  const email = body.email.toLowerCase().trim()
  const name = body.name.trim()

  try {
    // Check if user already exists
    const existingUser = await queryOne(
      'SELECT id FROM team_members WHERE email = $1',
      [email]
    )

    if (existingUser) {
      throw createError({
        statusCode: 409,
        statusMessage: 'An account with this email already exists'
      })
    }

    // If invite token provided, validate it
    let invitation = null
    if (body.inviteToken) {
      invitation = await queryOne(`
        SELECT id, email, user_role, department_ids, invited_by
        FROM team_invitations
        WHERE token = $1 AND status = 'pending' AND expires_at > NOW()
      `, [body.inviteToken])

      if (!invitation) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid or expired invitation'
        })
      }

      if (invitation.email.toLowerCase() !== email) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Email does not match invitation'
        })
      }
    }

    // Hash password
    const passwordHash = await hashPassword(body.password)

    // Determine role (from invitation or default)
    const role = invitation?.user_role || 'member'

    // Create user
    const user = await queryOne(`
      INSERT INTO team_members (name, email, password_hash, user_role, is_active, email_verified)
      VALUES ($1, $2, $3, $4, true, $5)
      RETURNING id, email, name, user_role
    `, [name, email, passwordHash, role, !!invitation]) // Auto-verify if from invitation

    if (!user) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create user'
      })
    }

    // If invitation, update it and add to departments
    if (invitation) {
      // Mark invitation as accepted
      await queryOne(`
        UPDATE team_invitations
        SET status = 'accepted', accepted_at = NOW(), accepted_by = $1
        WHERE id = $2
      `, [user.id, invitation.id])

      // Add to departments if specified
      if (invitation.department_ids?.length) {
        for (const deptId of invitation.department_ids) {
          await queryOne(`
            INSERT INTO department_members (department_id, team_member_id, role, is_primary)
            VALUES ($1, $2, 'member', $3)
            ON CONFLICT DO NOTHING
          `, [deptId, user.id, invitation.department_ids.indexOf(deptId) === 0])
        }

        // Set primary department
        await queryOne(`
          UPDATE team_members SET department_id = $1 WHERE id = $2
        `, [invitation.department_ids[0], user.id])
      }
    } else {
      // Send email verification for non-invite signups
      const verificationToken = generateToken()
      const tokenHash = hashToken(verificationToken)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

      await queryOne(`
        INSERT INTO email_verification_tokens (user_id, email, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
      `, [user.id, email, tokenHash, expiresAt])

      await sendVerificationEmail({
        to: email,
        name,
        token: verificationToken
      })
    }

    // Create session
    const { token, expiresAt } = await createSession(user.id, event)

    // Set auth cookie
    setCookie(event, 'auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/'
    })

    // Log activity
    await logActivity({
      userId: user.id,
      action: 'register',
      resourceType: 'user',
      resourceId: user.id,
      event
    })

    // Send welcome email
    await sendWelcomeEmail({ to: email, name })

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.user_role
      },
      token,
      expiresAt
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Registration error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Registration failed'
    })
  }
})
