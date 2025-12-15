/**
 * Update Team Member
 * PUT /api/agency/team-members/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Team member ID is required'
    })
  }

  const {
    name,
    email,
    role,
    department,
    hourlyRate,
    hourlyCost,
    targetUtilization,
    avatarUrl,
    isActive
  } = body

  try {
    // Check if team member exists
    const existing = await queryOne(
      'SELECT id FROM team_members WHERE id = $1',
      [id]
    )

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Team member not found'
      })
    }

    // Check if email is being changed and if it conflicts
    if (email) {
      const emailConflict = await queryOne(
        'SELECT id FROM team_members WHERE email = $1 AND id != $2',
        [email, id]
      )
      if (emailConflict) {
        throw createError({
          statusCode: 409,
          statusMessage: 'A team member with this email already exists'
        })
      }
    }

    // Build dynamic update query
    const updates: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`)
      params.push(name)
      paramIndex++
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex}`)
      params.push(email)
      paramIndex++
    }
    if (role !== undefined) {
      updates.push(`role = $${paramIndex}`)
      params.push(role || null)
      paramIndex++
    }
    if (department !== undefined) {
      updates.push(`department = $${paramIndex}`)
      params.push(department || null)
      paramIndex++
    }
    if (hourlyRate !== undefined) {
      updates.push(`hourly_rate = $${paramIndex}`)
      params.push(hourlyRate || null)
      paramIndex++
    }
    if (hourlyCost !== undefined) {
      updates.push(`hourly_cost = $${paramIndex}`)
      params.push(hourlyCost || null)
      paramIndex++
    }
    if (targetUtilization !== undefined) {
      updates.push(`target_utilization = $${paramIndex}`)
      params.push(targetUtilization || null)
      paramIndex++
    }
    if (avatarUrl !== undefined) {
      updates.push(`avatar_url = $${paramIndex}`)
      params.push(avatarUrl || null)
      paramIndex++
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`)
      params.push(isActive)
      paramIndex++
    }

    if (updates.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No fields to update'
      })
    }

    updates.push('updated_at = NOW()')
    params.push(id)

    const result = await queryOne(`
      UPDATE team_members
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, params)

    return {
      member: {
        id: result.id,
        name: result.name,
        email: result.email,
        role: result.role,
        department: result.department,
        hourlyRate: Number(result.hourly_rate || 0),
        hourlyCost: Number(result.hourly_cost || 0),
        targetUtilization: Number(result.target_utilization || 0),
        avatarUrl: result.avatar_url,
        isActive: result.is_active,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      }
    }
  } catch (error: any) {
    console.error('Failed to update team member:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update team member'
    })
  }
})
