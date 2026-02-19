/**
 * Update User
 * PUT /api/auth/users/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole, logActivity } from '~~/server/utils/auth'

interface UpdateUserBody {
  name?: string
  role?: string // job role
  avatarUrl?: string
  departmentId?: string
}

export default defineEventHandler(async (event) => {
  const currentUser = await requireAuth(event)
  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  // Users can update their own profile, admins/owners can update anyone
  const isOwnProfile = currentUser.id === userId
  const isAdmin = ['admin', 'owner'].includes(currentUser.role)

  if (!isOwnProfile && !isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Not authorized to update this user'
    })
  }

  const body = await readBody<UpdateUserBody>(event)

  try {
    // Check user exists
    const existingUser = await queryOne(`
      SELECT id, name, role, avatar_url, department_id
      FROM team_members
      WHERE id = $1
    `, [userId])

    if (!existingUser) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Build update query
    const updates: string[] = []
    const params: any[] = []
    let paramIdx = 1

    if (body.name !== undefined) {
      updates.push(`name = $${paramIdx}`)
      params.push(body.name)
      paramIdx++
    }

    if (body.role !== undefined) {
      updates.push(`role = $${paramIdx}`)
      params.push(body.role)
      paramIdx++
    }

    if (body.avatarUrl !== undefined) {
      updates.push(`avatar_url = $${paramIdx}`)
      params.push(body.avatarUrl)
      paramIdx++
    }

    if (body.departmentId !== undefined) {
      updates.push(`department_id = $${paramIdx}`)
      params.push(body.departmentId || null)
      paramIdx++
    }

    if (updates.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No fields to update'
      })
    }

    updates.push('updated_at = NOW()')
    params.push(userId)

    const updatedUser = await queryOne(`
      UPDATE team_members
      SET ${updates.join(', ')}
      WHERE id = $${paramIdx}
      RETURNING id, name, email, role, user_role, avatar_url, department_id, is_active
    `, params)

    // Log activity
    await logActivity({
      userId: currentUser.id,
      action: 'user_updated',
      resourceType: 'user',
      resourceId: userId,
      metadata: {
        updatedFields: Object.keys(body),
        updatedBy: currentUser.id
      },
      event
    })

    return {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      jobRole: updatedUser.role,
      userRole: updatedUser.user_role,
      avatarUrl: updatedUser.avatar_url,
      departmentId: updatedUser.department_id,
      isActive: updatedUser.is_active
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Failed to update user:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update user'
    })
  }
})
