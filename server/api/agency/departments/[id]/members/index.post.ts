/**
 * Add a member to a department
 */

import { queryOne } from '~~/server/utils/db'

interface AddMemberBody {
  teamMemberId: string
  role?: string
  isPrimary?: boolean
}

export default defineEventHandler(async (event) => {
  const departmentId = getRouterParam(event, 'id')
  const body = await readBody<AddMemberBody>(event)

  if (!departmentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Department ID is required'
    })
  }

  if (!body.teamMemberId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Team member ID is required'
    })
  }

  try {
    // Verify department exists
    const department = await queryOne('SELECT id FROM departments WHERE id = $1', [departmentId])
    if (!department) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Department not found'
      })
    }

    // Verify team member exists
    const teamMember = await queryOne('SELECT id, name FROM team_members WHERE id = $1', [body.teamMemberId])
    if (!teamMember) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Team member not found'
      })
    }

    // Check if already a member
    const existing = await queryOne(
      'SELECT id FROM department_members WHERE department_id = $1 AND team_member_id = $2',
      [departmentId, body.teamMemberId]
    )
    if (existing) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Team member is already in this department'
      })
    }

    const membership = await queryOne(`
      INSERT INTO department_members (department_id, team_member_id, role, is_primary)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [
      departmentId,
      body.teamMemberId,
      body.role || 'member',
      body.isPrimary ?? false,
    ])

    return {
      membershipId: membership.id,
      departmentId: membership.department_id,
      teamMemberId: membership.team_member_id,
      teamMemberName: teamMember.name,
      role: membership.role,
      isPrimary: membership.is_primary,
      createdAt: membership.created_at,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to add department member:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to add department member'
    })
  }
})
