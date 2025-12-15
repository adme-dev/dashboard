/**
 * Get upcoming deadlines across departments
 */

import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const departmentId = query.departmentId as string | undefined
  const assigneeId = query.assigneeId as string | undefined
  const days = Math.min(Number(query.days) || 14, 30)  // Default 2 weeks, max 30 days
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    // Build conditions
    const conditions: string[] = [
      't.due_date >= CURRENT_DATE',
      `t.due_date <= CURRENT_DATE + INTERVAL '${days} days'`,
      'ts.is_final = false'
    ]
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
        COUNT(*) as total_upcoming,
        COUNT(*) FILTER (WHERE t.due_date = CURRENT_DATE) as due_today,
        COUNT(*) FILTER (WHERE t.due_date = CURRENT_DATE + INTERVAL '1 day') as due_tomorrow,
        COUNT(*) FILTER (WHERE t.due_date <= CURRENT_DATE + INTERVAL '7 days') as due_this_week,
        COUNT(*) FILTER (WHERE t.priority IN ('urgent', 'high')) as high_priority,
        COUNT(DISTINCT t.department_id) as departments_with_deadlines
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE ${whereClause}
    `, params)

    // Get upcoming tasks
    const tasks = await queryRows(`
      SELECT
        t.id, t.title, t.priority, t.due_date, t.start_date,
        t.estimated_hours, t.is_blocked, t.blocked_reason,
        t.due_date - CURRENT_DATE as days_until_due,
        ts.name as status_name, ts.color as status_color, ts.category as status_category,
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
        t.due_date ASC,
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
      LIMIT $${idx}
    `, [...params, limit])

    // Group by time period
    const byPeriod = {
      today: tasks.filter(t => Number(t.days_until_due) === 0),
      tomorrow: tasks.filter(t => Number(t.days_until_due) === 1),
      thisWeek: tasks.filter(t => Number(t.days_until_due) >= 2 && Number(t.days_until_due) <= 7),
      nextWeek: tasks.filter(t => Number(t.days_until_due) > 7 && Number(t.days_until_due) <= 14),
      later: tasks.filter(t => Number(t.days_until_due) > 14),
    }

    return {
      stats: {
        totalUpcoming: Number(stats?.total_upcoming) || 0,
        dueToday: Number(stats?.due_today) || 0,
        dueTomorrow: Number(stats?.due_tomorrow) || 0,
        dueThisWeek: Number(stats?.due_this_week) || 0,
        highPriority: Number(stats?.high_priority) || 0,
        departmentsWithDeadlines: Number(stats?.departments_with_deadlines) || 0,
      },
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        dueDate: t.due_date,
        startDate: t.start_date,
        daysUntilDue: Number(t.days_until_due),
        estimatedHours: t.estimated_hours ? Number(t.estimated_hours) : null,
        isBlocked: t.is_blocked,
        blockedReason: t.blocked_reason,
        status: {
          name: t.status_name,
          color: t.status_color,
          category: t.status_category,
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
      byPeriod: {
        today: byPeriod.today.length,
        tomorrow: byPeriod.tomorrow.length,
        thisWeek: byPeriod.thisWeek.length,
        nextWeek: byPeriod.nextWeek.length,
        later: byPeriod.later.length,
      },
    }
  } catch (error) {
    console.error('Failed to fetch upcoming deadlines:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch upcoming deadlines'
    })
  }
})
