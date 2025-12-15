/**
 * Create Team Member
 * POST /api/agency/team-members
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)

  const {
    name,
    email,
    role,
    department,
    hourlyRate,
    hourlyCost,
    targetUtilization,
    avatarUrl,
    isActive = true
  } = body

  if (!name || !email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Name and email are required'
    })
  }

  try {
    // Check if email already exists
    const existing = await queryOne(
      'SELECT id FROM team_members WHERE email = $1',
      [email]
    )

    if (existing) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A team member with this email already exists'
      })
    }

    const result = await queryOne(`
      INSERT INTO team_members (
        name,
        email,
        role,
        department,
        hourly_rate,
        hourly_cost,
        target_utilization,
        avatar_url,
        is_active,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *
    `, [
      name,
      email,
      role || null,
      department || null,
      hourlyRate || null,
      hourlyCost || null,
      targetUtilization || null,
      avatarUrl || null,
      isActive
    ])

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
        createdAt: result.created_at
      }
    }
  } catch (error: any) {
    console.error('Failed to create team member:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create team member'
    })
  }
})
