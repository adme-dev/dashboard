/**
 * Update user
 * PATCH /api/admin/users/:id
 */

import { requireRole } from '../../../utils/auth'
import { queryOne } from '../../../utils/db'

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID required' })
  }

  const body = await readBody(event)
  const { name, email, role, isActive } = body

  if (role !== undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Use /api/auth/users/:id/role to change roles'
    })
  }

  if (isActive !== undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Use /api/auth/users/:id/status to change user status'
    })
  }

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
    if (error.statusCode) throw error

    console.error('[Admin Users Update] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update user: ${error.message}`
    })
  }
})
