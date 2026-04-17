/**
 * Get all members of a department
 */

import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Department ID is required'
    })
  }

  try {
    // Verify department exists
    const department = await queryOne('SELECT id FROM departments WHERE id = $1', [id])
    if (!department) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Department not found'
      })
    }

    const members = await queryRows(`
      SELECT
        dm.id as membership_id,
        dm.role as department_role,
        dm.joined_at,
        tm.id,
        tm.name,
        tm.email,
        tm.role,
        tm.default_hourly_rate,
        tm.target_utilization,
        tm.is_active,
        COALESCE(stats.active_task_count, 0) as active_task_count,
        COALESCE(stats.overdue_task_count, 0) as overdue_task_count,
        COALESCE(stats.estimated_hours, 0) as estimated_hours
      FROM department_members dm
      JOIN team_members tm ON dm.team_member_id = tm.id
      LEFT JOIN (
        SELECT
          t.assignee_id,
          COUNT(*) FILTER (WHERE t.status_is_final = false) as active_task_count,
          COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status_is_final = false) as overdue_task_count,
          SUM(t.estimated_hours) FILTER (WHERE t.status_is_final = false) as estimated_hours
        FROM tasks t
        JOIN task_statuses ts ON t.status_id = ts.id
        WHERE t.department_id = $1
        GROUP BY t.assignee_id
      ) stats ON tm.id = stats.assignee_id
      WHERE dm.department_id = $1
      ORDER BY tm.name
    `, [id])

    return members.map(m => ({
      membershipId: m.membership_id,
      departmentRole: m.department_role,
      joinedAt: m.joined_at,
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      defaultHourlyRate: m.default_hourly_rate ? Number(m.default_hourly_rate) : null,
      targetUtilization: m.target_utilization ? Number(m.target_utilization) : null,
      isActive: m.is_active,
      activeTaskCount: Number(m.active_task_count) || 0,
      overdueTaskCount: Number(m.overdue_task_count) || 0,
      estimatedHours: Number(m.estimated_hours) || 0,
    }))
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch department members:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch department members'
    })
  }
})
