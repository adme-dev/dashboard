/**
 * Create super admin user
 * POST /api/admin/create-super-admin
 * Body: { name: string, email: string }
 */

import { readBody, createError } from 'h3'
import { queryOne } from '../../utils/db'

export default defineEventHandler(async (event) => {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Not allowed in production'
    })
  }

  const body = await readBody(event)
  const { name, email } = body

  if (!email || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Name and email are required'
    })
  }

  const normalizedEmail = email.toLowerCase().trim()

  try {
    // Check if user exists
    const existingUser = await queryOne(
      `SELECT id FROM team_members WHERE email = $1`,
      [normalizedEmail]
    )

    let userId: string

    if (existingUser) {
      // Update existing user to admin
      const result = await queryOne(
        `UPDATE team_members 
         SET role = 'admin', 
             is_active = true,
             name = $2,
             updated_at = NOW()
         WHERE email = $1
         RETURNING id`,
        [normalizedEmail, name]
      )
      userId = result?.id
      console.log('[Super Admin] Updated existing user:', normalizedEmail)
    } else {
      // Create new admin user
      const result = await queryOne(
        `INSERT INTO team_members (name, email, role, is_active, created_at, updated_at)
         VALUES ($1, $2, 'admin', true, NOW(), NOW())
         RETURNING id`,
        [name, normalizedEmail]
      )
      userId = result?.id
      console.log('[Super Admin] Created new user:', normalizedEmail)
    }

    return {
      success: true,
      message: 'Super admin created/updated',
      userId,
      email: normalizedEmail,
      role: 'admin'
    }
  } catch (error) {
    console.error('Failed to create super admin:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create super admin'
    })
  }
})
