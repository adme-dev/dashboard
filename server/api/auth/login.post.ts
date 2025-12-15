/**
 * User Login
 * POST /api/auth/login
 */

import { queryOne } from '~~/server/utils/db'
import { verifyPassword, createSession, logActivity } from '~~/server/utils/auth'

interface LoginBody {
  email: string
  password: string
  remember?: boolean
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LoginBody>(event)

  if (!body.email || !body.password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email and password are required'
    })
  }

  const email = body.email.toLowerCase().trim()

  try {
    // Get user
    const user = await queryOne(`
      SELECT id, email, name, password_hash, user_role, is_active, avatar_url, department_id
      FROM team_members
      WHERE email = $1
    `, [email])

    if (!user) {
      // Use generic message to prevent email enumeration
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password'
      })
    }

    // Check if user is active
    if (!user.is_active) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Your account has been deactivated. Please contact an administrator.'
      })
    }

    // Check if password is set (could be guest or oauth user)
    if (!user.password_hash) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password'
      })
    }

    // Verify password
    const isValid = await verifyPassword(body.password, user.password_hash)

    if (!isValid) {
      // Log failed attempt
      await logActivity({
        userId: user.id,
        action: 'login_failed',
        resourceType: 'user',
        resourceId: user.id,
        event
      })

      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password'
      })
    }

    // Create session (longer expiry if "remember me")
    const expiryHours = body.remember ? 24 * 30 : 24 * 7 // 30 days vs 7 days
    const { token, expiresAt } = await createSession(user.id, event)

    // Update last login
    await queryOne(`
      UPDATE team_members
      SET last_login_at = NOW(), last_active_at = NOW()
      WHERE id = $1
    `, [user.id])

    // Set auth cookie
    setCookie(event, 'auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/'
    })

    // Log successful login
    await logActivity({
      userId: user.id,
      action: 'login',
      resourceType: 'user',
      resourceId: user.id,
      event
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.user_role,
        avatarUrl: user.avatar_url,
        departmentId: user.department_id
      },
      token,
      expiresAt
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Login error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Login failed'
    })
  }
})
