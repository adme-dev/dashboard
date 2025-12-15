/**
 * Remove a member from a department
 */

import { queryOne, queryCount } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const departmentId = getRouterParam(event, 'id')
  const memberId = getRouterParam(event, 'memberId')

  if (!departmentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Department ID is required'
    })
  }

  if (!memberId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Member ID is required'
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

    // Delete membership (memberId is the team_member_id, not the membership id)
    const deleted = await queryCount(
      'DELETE FROM department_members WHERE department_id = $1 AND team_member_id = $2',
      [departmentId, memberId]
    )

    if (deleted === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Member not found in this department'
      })
    }

    return { success: true, message: 'Member removed from department' }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to remove department member:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to remove department member'
    })
  }
})
