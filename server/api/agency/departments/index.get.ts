/**
 * List all departments with member counts and active task stats
 */

import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const activeOnly = query.active !== 'false'

  try {
    const departments = await queryRows(`
      SELECT
        d.*,
        COALESCE(m.member_count, 0) as member_count,
        COALESCE(t.active_tasks, 0) as active_tasks,
        COALESCE(t.overdue_tasks, 0) as overdue_tasks,
        COALESCE(t.completed_this_week, 0) as completed_this_week
      FROM departments d
      LEFT JOIN (
        SELECT department_id, COUNT(*) as member_count
        FROM department_members
        GROUP BY department_id
      ) m ON d.id = m.department_id
      LEFT JOIN (
        SELECT
          t.department_id,
          COUNT(*) FILTER (WHERE ts.is_final = false) as active_tasks,
          COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND ts.is_final = false) as overdue_tasks,
          COUNT(*) FILTER (WHERE t.completed_at >= CURRENT_DATE - INTERVAL '7 days') as completed_this_week
        FROM tasks t
        JOIN task_statuses ts ON t.status_id = ts.id
        GROUP BY t.department_id
      ) t ON d.id = t.department_id
      WHERE ($1 = false OR d.is_active = true)
      ORDER BY d.sort_order, d.name
    `, [!activeOnly])

    return departments.map(d => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      description: d.description,
      color: d.color,
      icon: d.icon,
      managerId: d.manager_id,
      isActive: d.is_active,
      sortOrder: d.sort_order,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      // Stats
      memberCount: Number(d.member_count) || 0,
      activeTasks: Number(d.active_tasks) || 0,
      overdueTasks: Number(d.overdue_tasks) || 0,
      completedThisWeek: Number(d.completed_this_week) || 0,
    }))
  } catch (error) {
    console.error('Failed to fetch departments:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch departments'
    })
  }
})
