/**
 * Get current user's tasks
 * Note: In a real app, userId would come from auth context
 */

import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const userId = query.userId as string

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  try {
    // Verify user exists
    const user = await queryOne('SELECT id, name FROM team_members WHERE id = $1', [userId])
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Get tasks grouped by status category
    const tasks = await queryRows(`
      SELECT
        t.*,
        ts.name as status_name,
        ts.color as status_color,
        ts.category as status_category,
        ts.is_final as status_is_final,
        d.name as department_name,
        d.color as department_color,
        p.name as project_name,
        c.name as client_name
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN agency_clients c ON p.client_id = c.id
      WHERE t.assignee_id = $1 AND ts.is_final = false
      ORDER BY
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        t.due_date NULLS LAST,
        t.created_at DESC
    `, [userId])

    // Get summary stats
    const stats = await queryOne(`
      SELECT
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE) as overdue,
        COUNT(*) FILTER (WHERE t.due_date = CURRENT_DATE) as due_today,
        COUNT(*) FILTER (WHERE t.due_date > CURRENT_DATE AND t.due_date <= CURRENT_DATE + INTERVAL '7 days') as due_this_week,
        COUNT(*) FILTER (WHERE ts.category = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE ts.category = 'review') as in_review,
        COUNT(*) FILTER (WHERE t.is_blocked = true) as blocked
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.assignee_id = $1 AND ts.is_final = false
    `, [userId])

    // Group tasks by category
    const tasksByCategory = {
      overdue: tasks.filter(t => t.due_date && new Date(t.due_date) < new Date(new Date().toDateString())),
      dueToday: tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString()),
      inProgress: tasks.filter(t => t.status_category === 'in_progress'),
      inReview: tasks.filter(t => t.status_category === 'review'),
      other: tasks.filter(t => !t.due_date || (
        new Date(t.due_date) > new Date() &&
        t.status_category !== 'in_progress' &&
        t.status_category !== 'review'
      )),
    }

    const formatTask = (t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      dueDate: t.due_date,
      isBlocked: t.is_blocked,
      blockedReason: t.blocked_reason,
      status: {
        id: t.status_id,
        name: t.status_name,
        color: t.status_color,
        category: t.status_category,
      },
      department: {
        id: t.department_id,
        name: t.department_name,
        color: t.department_color,
      },
      project: t.project_id ? {
        id: t.project_id,
        name: t.project_name,
        clientName: t.client_name,
      } : null,
    })

    return {
      user: {
        id: user.id,
        name: user.name,
      },
      stats: {
        totalTasks: Number(stats?.total_tasks) || 0,
        overdue: Number(stats?.overdue) || 0,
        dueToday: Number(stats?.due_today) || 0,
        dueThisWeek: Number(stats?.due_this_week) || 0,
        inProgress: Number(stats?.in_progress) || 0,
        inReview: Number(stats?.in_review) || 0,
        blocked: Number(stats?.blocked) || 0,
      },
      tasks: {
        overdue: tasksByCategory.overdue.map(formatTask),
        dueToday: tasksByCategory.dueToday.map(formatTask),
        inProgress: tasksByCategory.inProgress.map(formatTask),
        inReview: tasksByCategory.inReview.map(formatTask),
        other: tasksByCategory.other.map(formatTask),
      },
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch user tasks:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch user tasks'
    })
  }
})
