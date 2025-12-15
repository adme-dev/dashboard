/**
 * Activate/Deactivate User
 * PATCH /api/auth/users/:id/status
 */

import { queryOne } from '~~/server/utils/db'
import { requireRole, logActivity, invalidateAllSessions } from '~~/server/utils/auth'

interface StatusBody {
  isActive: boolean
}

export default defineEventHandler(async (event) => {
  // Only admins and owners can change user status
  const currentUser = await requireRole(event, ['admin', 'owner'])
  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  // Can't deactivate yourself
  if (userId === currentUser.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot deactivate your own account'
    })
  }

  const body = await readBody<StatusBody>(event)

  if (typeof body.isActive !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'isActive must be a boolean'
    })
  }

  try {
    // Get target user
    const targetUser = await queryOne(`
      SELECT id, name, user_role, is_active
      FROM team_members
      WHERE id = $1
    `, [userId])

    if (!targetUser) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Can't deactivate owners (unless you're also an owner)
    if (targetUser.user_role === 'owner' && currentUser.userRole !== 'owner') {
      throw createError({
        statusCode: 403,
        statusMessage: 'Cannot deactivate an owner account'
      })
    }

    // Update status
    const updatedUser = await queryOne(`
      UPDATE team_members
      SET is_active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, email, is_active
    `, [body.isActive, userId])

    // If deactivating, invalidate all their sessions
    if (!body.isActive) {
      await invalidateAllSessions(userId)
    }

    // Log activity
    await logActivity({
      userId: currentUser.id,
      action: body.isActive ? 'user_activated' : 'user_deactivated',
      resourceType: 'user',
      resourceId: userId,
      metadata: {
        previousStatus: targetUser.is_active,
        newStatus: body.isActive,
        changedBy: currentUser.id
      },
      event
    })

    return {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      isActive: updatedUser.is_active,
      message: body.isActive ? 'User activated' : 'User deactivated'
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Failed to update user status:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update user status'
    })
  }
})
