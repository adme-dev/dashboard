/**
 * Change User Role
 * PATCH /api/auth/users/:id/role
 */

import { queryOne } from '~~/server/utils/db'
import { requireRole, logActivity } from '~~/server/utils/auth'

interface ChangeRoleBody {
  userRole: 'owner' | 'admin' | 'member' | 'viewer' | 'guest'
}

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 100,
  admin: 80,
  member: 50,
  viewer: 30,
  guest: 10
}

export default defineEventHandler(async (event) => {
  // Only admins and owners can change roles
  const currentUser = await requireRole(event, ['admin', 'owner'])
  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  const body = await readBody<ChangeRoleBody>(event)

  if (!body.userRole || !ROLE_HIERARCHY[body.userRole]) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid user role is required (owner, admin, member, viewer, guest)'
    })
  }

  try {
    // Get target user
    const targetUser = await queryOne(`
      SELECT id, name, user_role
      FROM team_members
      WHERE id = $1
    `, [userId])

    if (!targetUser) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Check role hierarchy - can't change role of someone at same level or higher
    const currentUserLevel = ROLE_HIERARCHY[currentUser.role] || 0
    const targetUserLevel = ROLE_HIERARCHY[targetUser.user_role] || 0
    const newRoleLevel = ROLE_HIERARCHY[body.userRole] || 0

    if (targetUserLevel >= currentUserLevel) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Cannot change role of a user at the same level or higher'
      })
    }

    // Can't assign a role equal to or higher than your own (except owner can assign owner)
    if (newRoleLevel >= currentUserLevel && currentUser.role !== 'owner') {
      throw createError({
        statusCode: 403,
        statusMessage: 'Cannot assign a role equal to or higher than your own'
      })
    }

    // Owner role requires special handling
    if (body.userRole === 'owner' && currentUser.userRole !== 'owner') {
      throw createError({
        statusCode: 403,
        statusMessage: 'Only owners can assign the owner role'
      })
    }

    // Update role
    const updatedUser = await queryOne(`
      UPDATE team_members
      SET user_role = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, email, user_role
    `, [body.userRole, userId])

    // Log activity
    await logActivity({
      userId: currentUser.id,
      action: 'role_changed',
      resourceType: 'user',
      resourceId: userId,
      metadata: {
        previousRole: targetUser.user_role,
        newRole: body.userRole,
        changedBy: currentUser.id
      },
      event
    })

    return {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      userRole: updatedUser.user_role,
      message: `User role updated to ${body.userRole}`
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Failed to change user role:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to change user role'
    })
  }
})
