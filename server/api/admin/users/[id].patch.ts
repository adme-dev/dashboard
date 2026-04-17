/**
 * Update user
 * PATCH /api/admin/users/:id
 */

import { requireAuth } from '../../../utils/auth'
import { queryOne } from '../../../utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID required' })
  }

  const body = await readBody(event)
  const { name, email, role, isActive } = body

  try {
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`)
      values.push(name)
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`)
      values.push(email)
    }
    if (role !== undefined) {
      updates.push(`user_role = $${paramIndex++}`)
      values.push(role)
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`)
      values.push(isActive)
    }

    if (updates.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    }

    updates.push(`updated_at = NOW()`)
    values.push(userId)

    const user = await queryOne(`
      UPDATE team_members 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, email, role, is_active, updated_at
    `, values)

    return { success: true, user }

  } catch (error: any) {
    console.error('[Admin Users Update] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update user: ${error.message}`
    })
  }
})
