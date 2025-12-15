/**
 * Update User Profile
 * PUT /api/auth/profile
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateProfileBody {
  name?: string
  timezone?: string
  locale?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<UpdateProfileBody>(event)

  // Validate inputs
  if (body.name !== undefined && (!body.name?.trim() || body.name.length > 100)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Name must be between 1 and 100 characters'
    })
  }

  if (body.timezone !== undefined && body.timezone.length > 50) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid timezone'
    })
  }

  if (body.locale !== undefined && !/^[a-z]{2}(-[A-Z]{2})?$/.test(body.locale)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid locale format (expected: en, en-US, etc.)'
    })
  }

  try {
    const updates: string[] = []
    const values: any[] = []
    let paramIdx = 1

    if (body.name !== undefined) {
      updates.push(`name = $${paramIdx++}`)
      values.push(body.name.trim())
    }

    if (body.timezone !== undefined) {
      updates.push(`timezone = $${paramIdx++}`)
      values.push(body.timezone)
    }

    if (body.locale !== undefined) {
      updates.push(`locale = $${paramIdx++}`)
      values.push(body.locale)
    }

    if (updates.length === 0) {
      return {
        success: true,
        message: 'No changes to save'
      }
    }

    updates.push('updated_at = NOW()')
    values.push(user.id)

    const result = await queryOne(`
      UPDATE team_members
      SET ${updates.join(', ')}
      WHERE id = $${paramIdx}
      RETURNING id, name, email, timezone, locale, avatar_url
    `, values)

    return {
      success: true,
      user: {
        id: result.id,
        name: result.name,
        email: result.email,
        timezone: result.timezone,
        locale: result.locale,
        avatarUrl: result.avatar_url
      }
    }
  } catch (error) {
    console.error('Failed to update profile:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update profile'
    })
  }
})
