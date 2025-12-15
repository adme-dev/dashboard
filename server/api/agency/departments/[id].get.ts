/**
 * Get department details by ID with members and stats
 */

import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Department ID is required'
    })
  }

  try {
    // Get department with manager info
    const department = await queryOne(`
      SELECT
        d.*,
        tm.name as manager_name,
        tm.email as manager_email
      FROM departments d
      LEFT JOIN team_members tm ON d.manager_id = tm.id
      WHERE d.id = $1
    `, [id])

    if (!department) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Department not found'
      })
    }

    // Get department members
    const members = await queryRows(`
      SELECT
        dm.id as membership_id,
        dm.role as department_role,
        dm.is_primary,
        dm.created_at as joined_at,
        tm.id,
        tm.name,
        tm.email,
        tm.role,
        tm.is_active,
        COALESCE(t.active_task_count, 0) as active_task_count
      FROM department_members dm
      JOIN team_members tm ON dm.team_member_id = tm.id
      LEFT JOIN (
        SELECT assignee_id, COUNT(*) as active_task_count
        FROM tasks t
        JOIN task_statuses ts ON t.status_id = ts.id
        WHERE ts.is_final = false
        GROUP BY assignee_id
      ) t ON tm.id = t.assignee_id
      WHERE dm.department_id = $1
      ORDER BY dm.is_primary DESC, tm.name
    `, [id])

    // Get task stats by status
    const taskStats = await queryRows(`
      SELECT
        ts.id as status_id,
        ts.name as status_name,
        ts.color as status_color,
        ts.category,
        COUNT(t.id) as task_count
      FROM task_statuses ts
      LEFT JOIN tasks t ON ts.id = t.status_id AND t.department_id = $1
      WHERE ts.department_id IS NULL OR ts.department_id = $1
      GROUP BY ts.id, ts.name, ts.color, ts.category, ts.sort_order
      ORDER BY ts.sort_order
    `, [id])

    return {
      id: department.id,
      name: department.name,
      slug: department.slug,
      description: department.description,
      color: department.color,
      icon: department.icon,
      managerId: department.manager_id,
      managerName: department.manager_name,
      managerEmail: department.manager_email,
      isActive: department.is_active,
      sortOrder: department.sort_order,
      createdAt: department.created_at,
      updatedAt: department.updated_at,
      members: members.map(m => ({
        membershipId: m.membership_id,
        departmentRole: m.department_role,
        isPrimary: m.is_primary,
        joinedAt: m.joined_at,
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        isActive: m.is_active,
        activeTaskCount: Number(m.active_task_count) || 0,
      })),
      taskStats: taskStats.map(s => ({
        statusId: s.status_id,
        statusName: s.status_name,
        statusColor: s.status_color,
        category: s.category,
        taskCount: Number(s.task_count) || 0,
      })),
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch department:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch department'
    })
  }
})
