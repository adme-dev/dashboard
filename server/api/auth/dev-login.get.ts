/**
 * Dev Auto-Login (Development Only)
 * GET /api/auth/dev-login
 * 
 * Automatically logs in as the first admin/user for development/testing
 * This endpoint only works in development mode
 */

import { createError } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { createSession } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    throw createError({
      statusCode: 403,
      statusMessage: 'This endpoint is only available in development mode'
    })
  }

  try {
    // Get first admin or any active user
    let user = await queryOne(`
      SELECT id, email, name, user_role, avatar_url, department_id
      FROM team_members
      WHERE is_active = true AND user_role IN ('owner', 'admin')
      ORDER BY created_at ASC
      LIMIT 1
    `)

    // If no admin, get any active user
    if (!user) {
      user = await queryOne(`
        SELECT id, email, name, user_role, avatar_url, department_id
        FROM team_members
        WHERE is_active = true
        ORDER BY created_at ASC
        LIMIT 1
      `)
    }

    if (!user) {
      throw createError({
        statusCode: 500,
        statusMessage: 'No users found in database'
      })
    }

    // Create session (returns JWT string)
    const token = await createSession(user.id, event)

    // Set auth cookie (expire in 7 days)
    const expires = new Date()
    expires.setDate(expires.getDate() + 7)
    setCookie(event, 'auth_token', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      expires,
      path: '/'
    })

    // Client-visible cookie for detection
    setCookie(event, 'auth_status', 'logged_in', {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      expires,
      path: '/'
    })

    // Client-accessible token for client-side auth middleware
    setCookie(event, 'auth_token_client', token, {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      expires,
      path: '/'
    })

    return {
      success: true,
      message: `Logged in as ${user.name} (${user.email})`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.user_role
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    
    console.error('Dev login error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Dev login failed'
    })
  }
})
