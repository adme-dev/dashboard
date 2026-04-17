/**
 * Get department dashboard data with stats and recent activity
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
    // Verify department exists
    const department = await queryOne(`
      SELECT d.*, tm.name as manager_name
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

    // Get task stats by status
    const statusStats = await queryRows(`
      SELECT
        ts.id as status_id,
        ts.name as status_name,
        ts.color as status_color,
        ts.category,
        ts.sort_order,
        COUNT(t.id) as count
      FROM task_statuses ts
      LEFT JOIN tasks t ON ts.id = t.status_id AND t.department_id = $1
      WHERE ts.department_id IS NULL OR ts.department_id = $1
      GROUP BY ts.id, ts.name, ts.color, ts.category, ts.sort_order
      ORDER BY ts.sort_order
    `, [id])

    // Get overall stats
    const overallStats = await queryOne(`
      SELECT
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE t.status_is_final = false) as active_tasks,
        COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status_is_final = false) as overdue_tasks,
        COUNT(*) FILTER (WHERE t.completed_at >= CURRENT_DATE - INTERVAL '7 days') as completed_this_week,
        COUNT(*) FILTER (WHERE ts.category = 'review') as in_review,
        COUNT(*) FILTER (WHERE t.is_blocked = true AND t.status_is_final = false) as blocked_tasks,
        ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 3600)::numeric, 1) as avg_completion_hours
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.department_id = $1
    `, [id])

    // Get priority distribution
    const priorityStats = await queryRows(`
      SELECT
        t.priority,
        COUNT(*) as count
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.department_id = $1 AND t.status_is_final = false
      GROUP BY t.priority
    `, [id])

    // Get member workload
    const memberWorkload = await queryRows(`
      SELECT
        tm.id,
        tm.name,
        tm.email,
        tm.target_utilization,
        COUNT(t.id) FILTER (WHERE t.status_is_final = false) as active_tasks,
        COALESCE(SUM(t.estimated_hours) FILTER (WHERE t.status_is_final = false), 0) as estimated_hours,
        COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status_is_final = false) as overdue_tasks
      FROM department_members dm
      JOIN team_members tm ON dm.team_member_id = tm.id
      LEFT JOIN tasks t ON t.assignee_id = tm.id AND t.department_id = $1
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE dm.department_id = $1
      GROUP BY tm.id, tm.name, tm.email, tm.target_utilization
      ORDER BY active_tasks DESC
    `, [id])

    // Get recent activity
    const recentActivity = await queryRows(`
      SELECT
        ta.id,
        ta.activity_type,
        ta.content,
        ta.created_at,
        t.id as task_id,
        t.title as task_title,
        tm.name as user_name
      FROM task_activities ta
      JOIN tasks t ON ta.task_id = t.id
      LEFT JOIN team_members tm ON ta.user_id = tm.id
      WHERE t.department_id = $1
      ORDER BY ta.created_at DESC
      LIMIT 10
    `, [id])

    // Get upcoming deadlines
    const upcomingDeadlines = await queryRows(`
      SELECT
        t.id, t.title, t.due_date, t.priority,
        ts.name as status_name, ts.color as status_color,
        assignee.name as assignee_name
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members assignee ON t.assignee_id = assignee.id
      WHERE t.department_id = $1
        AND t.due_date IS NOT NULL
        AND t.due_date >= CURRENT_DATE
        AND t.status_is_final = false
      ORDER BY t.due_date ASC
      LIMIT 10
    `, [id])

    return {
      department: {
        id: department.id,
        name: department.name,
        slug: department.slug,
        color: department.color,
        icon: department.icon,
        managerId: department.manager_id,
        managerName: department.manager_name,
      },
      stats: {
        totalTasks: Number(overallStats?.total_tasks) || 0,
        activeTasks: Number(overallStats?.active_tasks) || 0,
        overdueTasks: Number(overallStats?.overdue_tasks) || 0,
        completedThisWeek: Number(overallStats?.completed_this_week) || 0,
        inReview: Number(overallStats?.in_review) || 0,
        blockedTasks: Number(overallStats?.blocked_tasks) || 0,
        avgCompletionHours: Number(overallStats?.avg_completion_hours) || 0,
      },
      statusBreakdown: statusStats.map(s => ({
        statusId: s.status_id,
        statusName: s.status_name,
        statusColor: s.status_color,
        category: s.category,
        count: Number(s.count) || 0,
      })),
      priorityBreakdown: priorityStats.map(p => ({
        priority: p.priority,
        count: Number(p.count) || 0,
      })),
      memberWorkload: memberWorkload.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email,
        targetUtilization: m.target_utilization ? Number(m.target_utilization) : null,
        activeTasks: Number(m.active_tasks) || 0,
        estimatedHours: Number(m.estimated_hours) || 0,
        overdueTasks: Number(m.overdue_tasks) || 0,
      })),
      recentActivity: recentActivity.map(a => ({
        id: a.id,
        type: a.activity_type,
        content: a.content,
        createdAt: a.created_at,
        taskId: a.task_id,
        taskTitle: a.task_title,
        userName: a.user_name,
      })),
      upcomingDeadlines: upcomingDeadlines.map(t => ({
        id: t.id,
        title: t.title,
        dueDate: t.due_date,
        priority: t.priority,
        statusName: t.status_name,
        statusColor: t.status_color,
        assigneeName: t.assignee_name,
      })),
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch department dashboard:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch department dashboard'
    })
  }
})
