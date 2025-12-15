/**
 * Get all overdue tasks across departments
 */

import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const departmentId = query.departmentId as string | undefined
  const assigneeId = query.assigneeId as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    // Build conditions
    const conditions: string[] = ['t.due_date < CURRENT_DATE', 'ts.is_final = false']
    const params: any[] = []
    let idx = 1

    if (departmentId) {
      conditions.push(`t.department_id = $${idx}`)
      params.push(departmentId)
      idx++
    }

    if (assigneeId) {
      conditions.push(`t.assignee_id = $${idx}`)
      params.push(assigneeId)
      idx++
    }

    const whereClause = conditions.join(' AND ')

    // Get summary stats
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total_overdue,
        COUNT(*) FILTER (WHERE t.priority = 'urgent') as urgent_count,
        COUNT(*) FILTER (WHERE t.priority = 'high') as high_count,
        COUNT(*) FILTER (WHERE CURRENT_DATE - t.due_date > 7) as overdue_week_plus,
        COUNT(DISTINCT t.department_id) as departments_affected,
        COUNT(DISTINCT t.assignee_id) as assignees_affected
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE ${whereClause}
    `, params)

    // Get overdue tasks grouped by days overdue
    const tasks = await queryRows(`
      SELECT
        t.id, t.title, t.priority, t.due_date, t.is_blocked, t.blocked_reason,
        CURRENT_DATE - t.due_date as days_overdue,
        ts.name as status_name, ts.color as status_color,
        d.id as department_id, d.name as department_name, d.color as department_color,
        p.name as project_name,
        c.name as client_name,
        assignee.id as assignee_id, assignee.name as assignee_name, assignee.email as assignee_email
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN team_members assignee ON t.assignee_id = assignee.id
      WHERE ${whereClause}
      ORDER BY
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        t.due_date ASC
      LIMIT $${idx}
    `, [...params, limit])

    // Group by days overdue
    const byDaysOverdue = {
      critical: tasks.filter(t => Number(t.days_overdue) > 7),  // More than a week
      urgent: tasks.filter(t => Number(t.days_overdue) >= 3 && Number(t.days_overdue) <= 7),  // 3-7 days
      recent: tasks.filter(t => Number(t.days_overdue) < 3),  // Less than 3 days
    }

    return {
      stats: {
        totalOverdue: Number(stats?.total_overdue) || 0,
        urgentCount: Number(stats?.urgent_count) || 0,
        highCount: Number(stats?.high_count) || 0,
        overdueWeekPlus: Number(stats?.overdue_week_plus) || 0,
        departmentsAffected: Number(stats?.departments_affected) || 0,
        assigneesAffected: Number(stats?.assignees_affected) || 0,
      },
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        dueDate: t.due_date,
        daysOverdue: Number(t.days_overdue),
        isBlocked: t.is_blocked,
        blockedReason: t.blocked_reason,
        status: {
          name: t.status_name,
          color: t.status_color,
        },
        department: {
          id: t.department_id,
          name: t.department_name,
          color: t.department_color,
        },
        project: t.project_name ? {
          name: t.project_name,
          clientName: t.client_name,
        } : null,
        assignee: t.assignee_id ? {
          id: t.assignee_id,
          name: t.assignee_name,
          email: t.assignee_email,
        } : null,
      })),
      byDaysOverdue: {
        critical: byDaysOverdue.critical.length,
        urgent: byDaysOverdue.urgent.length,
        recent: byDaysOverdue.recent.length,
      },
    }
  } catch (error) {
    console.error('Failed to fetch overdue tasks:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch overdue tasks'
    })
  }
})
