/**
 * Get User Details
 * GET /api/auth/users/:id
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required'
    })
  }

  try {
    const user = await queryOne(`
      SELECT
        tm.id,
        tm.name,
        tm.email,
        tm.role,
        tm.user_role,
        tm.avatar_url,
        tm.department_id,
        tm.is_active,
        tm.email_verified,
        tm.last_login_at,
        tm.last_active_at,
        tm.created_at,
        d.name as department_name,
        d.color as department_color
      FROM team_members tm
      LEFT JOIN departments d ON tm.department_id = d.id
      WHERE tm.id = $1
    `, [userId])

    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found'
      })
    }

    // Get all department memberships
    const departments = await queryRows(`
      SELECT
        dm.role as membership_role,
        dm.is_primary,
        d.id as department_id,
        d.name as department_name,
        d.color as department_color
      FROM department_members dm
      JOIN departments d ON dm.department_id = d.id
      WHERE dm.team_member_id = $1 AND d.is_active = true
    `, [userId])

    // Get recent activity stats
    const activityStats = await queryOne(`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as actions_this_week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as actions_this_month
      FROM activity_log
      WHERE user_id = $1
    `, [userId])

    // Get task stats
    const taskStats = await queryOne(`
      SELECT
        COUNT(*) FILTER (WHERE status_id IN (SELECT id FROM task_statuses WHERE is_done = false)) as active_tasks,
        COUNT(*) FILTER (WHERE status_id IN (SELECT id FROM task_statuses WHERE is_done = true)) as completed_tasks,
        COUNT(*) FILTER (WHERE due_date < NOW() AND status_id IN (SELECT id FROM task_statuses WHERE is_done = false)) as overdue_tasks
      FROM tasks
      WHERE assignee_id = $1
    `, [userId])

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      jobRole: user.role,
      userRole: user.user_role,
      avatarUrl: user.avatar_url,
      isActive: user.is_active,
      emailVerified: user.email_verified,
      lastLoginAt: user.last_login_at,
      lastActiveAt: user.last_active_at,
      createdAt: user.created_at,
      primaryDepartment: user.department_id ? {
        id: user.department_id,
        name: user.department_name,
        color: user.department_color
      } : null,
      departments: departments.map(d => ({
        id: d.department_id,
        name: d.department_name,
        color: d.department_color,
        role: d.membership_role,
        isPrimary: d.is_primary
      })),
      stats: {
        activeTasks: parseInt(taskStats?.active_tasks || '0'),
        completedTasks: parseInt(taskStats?.completed_tasks || '0'),
        overdueTasks: parseInt(taskStats?.overdue_tasks || '0'),
        actionsThisWeek: parseInt(activityStats?.actions_this_week || '0'),
        actionsThisMonth: parseInt(activityStats?.actions_this_month || '0')
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error

    console.error('Failed to fetch user:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch user'
    })
  }
})
