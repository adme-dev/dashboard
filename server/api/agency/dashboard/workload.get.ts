/**
 * Get team workload data for capacity planning
 */

import { queryRows, queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const departmentId = query.departmentId as string | undefined

  try {
    // Build base condition
    let departmentCondition = ''
    let params: any[] = []

    if (departmentId) {
      departmentCondition = 'AND t.department_id = $1'
      params = [departmentId]
    }

    // Get workload by team member
    const memberWorkload = await queryRows(`
      SELECT
        tm.id,
        tm.name,
        tm.email,
        tm.role,
        tm.target_utilization,
        tm.default_hourly_rate,
        d.id as primary_department_id,
        d.name as primary_department_name,
        d.color as primary_department_color,
        COUNT(t.id) FILTER (WHERE ts.is_final = false) as active_tasks,
        COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND ts.is_final = false) as overdue_tasks,
        COUNT(t.id) FILTER (WHERE t.due_date = CURRENT_DATE AND ts.is_final = false) as due_today,
        COUNT(t.id) FILTER (WHERE t.due_date > CURRENT_DATE AND t.due_date <= CURRENT_DATE + INTERVAL '7 days' AND ts.is_final = false) as due_this_week,
        COALESCE(SUM(t.estimated_hours) FILTER (WHERE ts.is_final = false), 0) as total_estimated_hours,
        COALESCE(SUM(t.actual_hours), 0) as total_actual_hours,
        COUNT(t.id) FILTER (WHERE ts.category = 'in_progress') as in_progress,
        COUNT(t.id) FILTER (WHERE ts.category = 'review') as in_review
      FROM team_members tm
      LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
      LEFT JOIN departments d ON dm.department_id = d.id
      LEFT JOIN tasks t ON t.assignee_id = tm.id ${departmentCondition}
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE tm.is_active = true
      GROUP BY tm.id, tm.name, tm.email, tm.role, tm.target_utilization, tm.default_hourly_rate,
               d.id, d.name, d.color
      ORDER BY active_tasks DESC, tm.name
    `, params)

    // Get workload by department
    const departmentWorkload = await queryRows(`
      SELECT
        d.id,
        d.name,
        d.color,
        d.icon,
        COUNT(DISTINCT dm.team_member_id) as member_count,
        COUNT(t.id) FILTER (WHERE ts.is_final = false) as active_tasks,
        COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND ts.is_final = false) as overdue_tasks,
        COALESCE(SUM(t.estimated_hours) FILTER (WHERE ts.is_final = false), 0) as total_estimated_hours,
        COUNT(t.id) FILTER (WHERE ts.category = 'in_progress') as in_progress,
        COUNT(t.id) FILTER (WHERE ts.category = 'review') as in_review,
        COUNT(t.id) FILTER (WHERE t.assignee_id IS NULL AND ts.is_final = false) as unassigned_tasks
      FROM departments d
      LEFT JOIN department_members dm ON d.id = dm.department_id
      LEFT JOIN tasks t ON d.id = t.department_id
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE d.is_active = true
      GROUP BY d.id, d.name, d.color, d.icon
      ORDER BY active_tasks DESC
    `)

    // Get overall summary
    const summary = await queryOne(`
      SELECT
        COUNT(DISTINCT tm.id) as total_members,
        COUNT(t.id) FILTER (WHERE ts.is_final = false) as total_active_tasks,
        COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND ts.is_final = false) as total_overdue,
        COUNT(t.id) FILTER (WHERE t.assignee_id IS NULL AND ts.is_final = false) as total_unassigned,
        COALESCE(SUM(t.estimated_hours) FILTER (WHERE ts.is_final = false), 0) as total_estimated_hours,
        COUNT(DISTINCT t.assignee_id) FILTER (WHERE ts.is_final = false) as members_with_tasks
      FROM team_members tm
      LEFT JOIN tasks t ON t.assignee_id = tm.id ${departmentCondition}
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE tm.is_active = true
    `, params)

    return {
      summary: {
        totalMembers: Number(summary?.total_members) || 0,
        totalActiveTasks: Number(summary?.total_active_tasks) || 0,
        totalOverdue: Number(summary?.total_overdue) || 0,
        totalUnassigned: Number(summary?.total_unassigned) || 0,
        totalEstimatedHours: Number(summary?.total_estimated_hours) || 0,
        membersWithTasks: Number(summary?.members_with_tasks) || 0,
        averageTasksPerMember: summary?.total_members
          ? Math.round(Number(summary.total_active_tasks) / Number(summary.total_members) * 10) / 10
          : 0,
      },
      members: memberWorkload.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        targetUtilization: m.target_utilization ? Number(m.target_utilization) : null,
        defaultHourlyRate: m.default_hourly_rate ? Number(m.default_hourly_rate) : null,
        primaryDepartment: m.primary_department_id ? {
          id: m.primary_department_id,
          name: m.primary_department_name,
          color: m.primary_department_color,
        } : null,
        activeTasks: Number(m.active_tasks) || 0,
        overdueTasks: Number(m.overdue_tasks) || 0,
        dueToday: Number(m.due_today) || 0,
        dueThisWeek: Number(m.due_this_week) || 0,
        totalEstimatedHours: Number(m.total_estimated_hours) || 0,
        totalActualHours: Number(m.total_actual_hours) || 0,
        inProgress: Number(m.in_progress) || 0,
        inReview: Number(m.in_review) || 0,
      })),
      departments: departmentWorkload.map(d => ({
        id: d.id,
        name: d.name,
        color: d.color,
        icon: d.icon,
        memberCount: Number(d.member_count) || 0,
        activeTasks: Number(d.active_tasks) || 0,
        overdueTasks: Number(d.overdue_tasks) || 0,
        totalEstimatedHours: Number(d.total_estimated_hours) || 0,
        inProgress: Number(d.in_progress) || 0,
        inReview: Number(d.in_review) || 0,
        unassignedTasks: Number(d.unassigned_tasks) || 0,
      })),
    }
  } catch (error: any) {
    // Graceful degradation if tables don't exist yet
    if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
      return {
        summary: { totalMembers: 0, totalActiveTasks: 0, totalOverdue: 0, totalUnassigned: 0, totalEstimatedHours: 0, membersWithTasks: 0, averageTasksPerMember: 0 },
        members: [],
        departments: [],
      }
    }
    console.error('Failed to fetch workload data:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch workload data'
    })
  }
})
