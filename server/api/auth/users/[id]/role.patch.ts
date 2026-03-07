/**
 * Change User Role
 * PATCH /api/auth/users/:id/role
 */

import { queryOne } from '~~/server/utils/db'
import { requireRole, logActivity } from '~~/server/utils/auth'
import { invalidateUserPermissionCache } from '~~/server/utils/roleResolver'

interface ChangeRoleBody {
  userRole: string
  customRoleId?: string
}

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 100,
  admin: 90,
  lead: 80,
  project_manager: 75,
  account_manager: 60,
  creative: 55,
  media_buyer: 55,
  producer: 55,
  finance: 55,
  accounts: 55,
  developer: 55,
  sales: 55,
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

  if (!body.userRole) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User role is required'
    })
  }

  try {
    // Get target user
    const targetUser = await queryOne<{ id: string; name: string; user_role: string; custom_role_id: string | null }>(`
      SELECT id, name, user_role, custom_role_id
      FROM team_members
      WHERE id = $1
    `, [userId])

    if (!targetUser) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Check role hierarchy
    const currentUserLevel = ROLE_HIERARCHY[currentUser.role] || 50
    const targetUserLevel = ROLE_HIERARCHY[targetUser.user_role] || 50
    const newRoleLevel = ROLE_HIERARCHY[body.userRole] || 50

    if (targetUserLevel >= currentUserLevel && currentUser.role !== 'owner') {
      throw createError({
        statusCode: 403,
        statusMessage: 'Cannot change role of a user at the same level or higher'
      })
    }

    if (newRoleLevel >= currentUserLevel && currentUser.role !== 'owner') {
      throw createError({
        statusCode: 403,
        statusMessage: 'Cannot assign a role equal to or higher than your own'
      })
    }

    if (body.userRole === 'owner' && currentUser.role !== 'owner') {
      throw createError({
        statusCode: 403,
        statusMessage: 'Only owners can assign the owner role'
      })
    }

    let customRoleId: string | null = null

    if (body.customRoleId) {
      // Custom role assignment — verify role exists
      const customRole = await queryOne<{ id: string; is_system: boolean }>(
        'SELECT id, is_system FROM custom_roles WHERE id = $1',
        [body.customRoleId]
      )
      if (!customRole) {
        throw createError({ statusCode: 400, statusMessage: 'Custom role not found' })
      }
      customRoleId = customRole.id
    } else {
      // System role — look up matching custom_roles entry
      const systemRole = await queryOne<{ id: string }>(
        'SELECT id FROM custom_roles WHERE slug = $1 AND is_system = true',
        [body.userRole]
      )
      customRoleId = systemRole?.id || null
    }

    // Update role
    const updatedUser = await queryOne(`
      UPDATE team_members
      SET user_role = $1, custom_role_id = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING id, name, email, user_role
    `, [body.userRole, customRoleId, userId])

    // Invalidate permission caches
    await invalidateUserPermissionCache(event, userId)
    // Note: auth session KV cache uses token prefix as key — we can't invalidate it
    // without knowing the token. The role-perms cache will refresh on next request.

    // Log activity
    await logActivity(event, 'role_changed', 'user', userId, {
      previousRole: targetUser.user_role,
      newRole: body.userRole,
      customRoleId,
      changedBy: currentUser.id
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
