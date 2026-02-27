/**
 * Get Tasks for Timeline/Gantt View
 * GET /api/agency/tasks/timeline
 *
 * Returns tasks with date information suitable for timeline/Gantt visualization
 *
 * Query params:
 * - departmentId: Filter by department
 * - projectId: Filter by project
 * - startDate: Start of date range (YYYY-MM-DD)
 * - endDate: End of date range (YYYY-MM-DD)
 * - includeCompleted: Include completed tasks (default: true)
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  try {
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Only include tasks with dates (start_date or due_date)
    conditions.push('(t.start_date IS NOT NULL OR t.due_date IS NOT NULL)')

    // Department filter
    if (query.departmentId) {
      conditions.push(`t.department_id = $${paramIndex++}`)
      params.push(query.departmentId)
    }

    // Workspace filter (all departments in workspace)
    if (query.workspaceId && !query.departmentId) {
      conditions.push(`t.department_id IN (SELECT id FROM departments WHERE workspace_id = $${paramIndex++})`)
      params.push(query.workspaceId)
    }

    // Project filter
    if (query.projectId) {
      conditions.push(`t.project_id = $${paramIndex++}`)
      params.push(query.projectId)
    }

    // Date range filter
    if (query.startDate) {
      conditions.push(`COALESCE(t.due_date, t.start_date) >= $${paramIndex++}`)
      params.push(query.startDate)
    }

    if (query.endDate) {
      conditions.push(`COALESCE(t.start_date, t.due_date) <= $${paramIndex++}`)
      params.push(query.endDate)
    }

    // Completed tasks filter
    if (query.includeCompleted === 'false') {
      conditions.push('ts.is_final = false')
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const tasks = await queryRows(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.priority,
        t.task_type,
        t.start_date,
        t.due_date,
        t.estimated_hours,
        t.actual_hours,
        t.completed_at,
        t.is_blocked,
        t.blocked_reason,
        -- Calculate progress percentage
        CASE
          WHEN ts.is_final THEN 100
          WHEN t.estimated_hours IS NOT NULL AND t.estimated_hours > 0 THEN
            LEAST(100, ROUND((COALESCE(t.actual_hours, 0) / t.estimated_hours) * 100))
          ELSE 0
        END as progress_percentage,
        -- Status info
        ts.id as status_id,
        ts.name as status_name,
        ts.color as status_color,
        ts.category as status_category,
        ts.is_final,
        -- Department info
        d.id as department_id,
        d.name as department_name,
        d.color as department_color,
        -- Project info
        p.id as project_id,
        p.name as project_name,
        -- Assignee info
        tm.id as assignee_id,
        tm.name as assignee_name
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      JOIN departments d ON t.department_id = d.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN team_members tm ON t.assignee_id = tm.id
      ${whereClause}
      ORDER BY COALESCE(t.start_date, t.due_date) ASC, t.priority DESC
    `, params)

    // Get dependencies for these tasks
    const taskIds = tasks.map(t => t.id)
    let dependencies: any[] = []

    if (taskIds.length > 0) {
      dependencies = await queryRows(`
        SELECT
          td.task_id,
          td.depends_on_task_id,
          td.dependency_type,
          t.title as depends_on_title,
          ts.is_final as depends_on_completed
        FROM task_dependencies td
        JOIN tasks t ON td.depends_on_task_id = t.id
        JOIN task_statuses ts ON t.status_id = ts.id
        WHERE td.task_id = ANY($1)
      `, [taskIds])
    }

    // Format response
    const formattedTasks = tasks.map(task => ({
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      taskType: task.task_type,
      startDate: task.start_date,
      endDate: task.due_date, // Use due_date as end date for Gantt
      estimatedHours: task.estimated_hours,
      actualHours: task.actual_hours,
      progressPercentage: parseInt(task.progress_percentage) || 0,
      isCompleted: task.is_final,
      completedAt: task.completed_at,
      isBlocked: task.is_blocked,
      blockedReason: task.blocked_reason,
      status: {
        id: task.status_id,
        name: task.status_name,
        color: task.status_color,
        category: task.status_category
      },
      department: {
        id: task.department_id,
        name: task.department_name,
        color: task.department_color
      },
      project: task.project_id ? {
        id: task.project_id,
        name: task.project_name
      } : null,
      assignee: task.assignee_id ? {
        id: task.assignee_id,
        name: task.assignee_name
      } : null,
      dependencies: dependencies
        .filter(d => d.task_id === task.id)
        .map(d => ({
          taskId: d.depends_on_task_id,
          title: d.depends_on_title,
          type: d.dependency_type,
          isCompleted: d.depends_on_completed
        }))
    }))

    // Get milestones (tasks with type 'milestone')
    const milestones = formattedTasks.filter(t => t.taskType === 'milestone')

    // Calculate date range summary
    const allDates = formattedTasks.flatMap(t => [t.startDate, t.endDate].filter(Boolean))
    const minDate = allDates.length > 0 ? allDates.reduce((min, d) => d < min ? d : min) : null
    const maxDate = allDates.length > 0 ? allDates.reduce((max, d) => d > max ? d : max) : null

    return {
      tasks: formattedTasks,
      milestones,
      summary: {
        totalTasks: formattedTasks.length,
        completedTasks: formattedTasks.filter(t => t.isCompleted).length,
        blockedTasks: formattedTasks.filter(t => t.isBlocked).length,
        dateRange: {
          start: minDate,
          end: maxDate
        }
      }
    }
  } catch (error: any) {
    console.error('Failed to fetch timeline tasks:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch timeline data'
    })
  }
})
