/**
 * Task Completion Report
 * GET /api/agency/reports/task-completion
 *
 * Returns task completion metrics with filtering and grouping options
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CompletionMetrics {
  totalCompleted: number
  totalTasks: number
  completionRate: number
  averageCompletionDays: number
  byPeriod: Array<{
    period: string
    completed: number
    created: number
  }>
  byAssignee: Array<{
    assigneeId: string
    assigneeName: string
    completed: number
    onTime: number
    late: number
  }>
  byDepartment: Array<{
    departmentId: string
    departmentName: string
    completed: number
    completionRate: number
  }>
  byPriority: Array<{
    priority: string
    completed: number
    averageDays: number
  }>
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const dateFrom = query.dateFrom as string | undefined
  const dateTo = query.dateTo as string | undefined
  const departmentId = query.departmentId as string | undefined
  const projectId = query.projectId as string | undefined
  const groupBy = (query.groupBy as string) || 'day' // day, week, month

  try {
    // Build base conditions
    const conditions: string[] = []
    const params: (string | undefined)[] = []
    let paramIdx = 1

    if (dateFrom) {
      conditions.push(`t.updated_at >= $${paramIdx}::timestamp`)
      params.push(dateFrom)
      paramIdx++
    }

    if (dateTo) {
      conditions.push(`t.updated_at <= $${paramIdx}::timestamp`)
      params.push(dateTo)
      paramIdx++
    }

    if (departmentId) {
      conditions.push(`t.department_id = $${paramIdx}`)
      params.push(departmentId)
      paramIdx++
    }

    if (projectId) {
      conditions.push(`t.project_id = $${paramIdx}`)
      params.push(projectId)
      paramIdx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const completedWhereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')} AND t.status_is_final = true`
      : 'WHERE t.status_is_final = true'

    // Overall metrics
    const overallQuery = `
      SELECT
        COUNT(*) FILTER (WHERE t.status_is_final = true) AS total_completed,
        COUNT(*) AS total_tasks,
        ROUND(
          COUNT(*) FILTER (WHERE t.status_is_final = true)::numeric /
          NULLIF(COUNT(*)::numeric, 0) * 100, 1
        ) AS completion_rate,
        ROUND(
          AVG(
            CASE WHEN t.status_is_final = true
            THEN EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 86400
            END
          )::numeric, 1
        ) AS avg_completion_days
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      ${whereClause}
    `

    const overallResult = await queryRows(overallQuery, params)
    const overall = overallResult[0] || {
      total_completed: 0,
      total_tasks: 0,
      completion_rate: 0,
      avg_completion_days: 0
    }

    // By period (group by day/week/month)
    const periodTrunc = groupBy === 'month' ? 'month' : groupBy === 'week' ? 'week' : 'day'
    const byPeriodQuery = `
      SELECT
        DATE_TRUNC('${periodTrunc}', t.updated_at)::date AS period,
        COUNT(*) FILTER (WHERE t.status_is_final = true) AS completed,
        COUNT(*) FILTER (WHERE t.created_at >= DATE_TRUNC('${periodTrunc}', t.updated_at)) AS created
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      ${whereClause}
      GROUP BY DATE_TRUNC('${periodTrunc}', t.updated_at)
      ORDER BY period DESC
      LIMIT 30
    `

    const byPeriodResult = await queryRows(byPeriodQuery, params)

    // By assignee
    const byAssigneeQuery = `
      SELECT
        tm.id AS assignee_id,
        tm.name AS assignee_name,
        COUNT(*) FILTER (WHERE t.status_is_final = true) AS completed,
        COUNT(*) FILTER (
          WHERE t.status_is_final = true
          AND (t.due_date IS NULL OR t.updated_at <= t.due_date::timestamp)
        ) AS on_time,
        COUNT(*) FILTER (
          WHERE t.status_is_final = true
          AND t.due_date IS NOT NULL
          AND t.updated_at > t.due_date::timestamp
        ) AS late
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members tm ON t.assignee_id = tm.id
      ${whereClause}
      GROUP BY tm.id, tm.name
      HAVING COUNT(*) FILTER (WHERE t.status_is_final = true) > 0
      ORDER BY completed DESC
      LIMIT 20
    `

    const byAssigneeResult = await queryRows(byAssigneeQuery, params)

    // By department
    const byDepartmentQuery = `
      SELECT
        d.id AS department_id,
        d.name AS department_name,
        COUNT(*) FILTER (WHERE t.status_is_final = true) AS completed,
        ROUND(
          COUNT(*) FILTER (WHERE t.status_is_final = true)::numeric /
          NULLIF(COUNT(*)::numeric, 0) * 100, 1
        ) AS completion_rate
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN departments d ON t.department_id = d.id
      ${whereClause}
      GROUP BY d.id, d.name
      ORDER BY completed DESC
    `

    const byDepartmentResult = await queryRows(byDepartmentQuery, params)

    // By priority
    const byPriorityQuery = `
      SELECT
        t.priority,
        COUNT(*) FILTER (WHERE t.status_is_final = true) AS completed,
        ROUND(
          AVG(
            CASE WHEN t.status_is_final = true
            THEN EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 86400
            END
          )::numeric, 1
        ) AS avg_days
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      ${whereClause}
      GROUP BY t.priority
      ORDER BY
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END
    `

    const byPriorityResult = await queryRows(byPriorityQuery, params)

    const response: CompletionMetrics = {
      totalCompleted: Number(overall.total_completed) || 0,
      totalTasks: Number(overall.total_tasks) || 0,
      completionRate: Number(overall.completion_rate) || 0,
      averageCompletionDays: Number(overall.avg_completion_days) || 0,
      byPeriod: byPeriodResult.map(row => ({
        period: row.period,
        completed: Number(row.completed) || 0,
        created: Number(row.created) || 0
      })),
      byAssignee: byAssigneeResult.map(row => ({
        assigneeId: row.assignee_id,
        assigneeName: row.assignee_name || 'Unassigned',
        completed: Number(row.completed) || 0,
        onTime: Number(row.on_time) || 0,
        late: Number(row.late) || 0
      })),
      byDepartment: byDepartmentResult.map(row => ({
        departmentId: row.department_id,
        departmentName: row.department_name || 'No Department',
        completed: Number(row.completed) || 0,
        completionRate: Number(row.completion_rate) || 0
      })),
      byPriority: byPriorityResult.map(row => ({
        priority: row.priority || 'none',
        completed: Number(row.completed) || 0,
        averageDays: Number(row.avg_days) || 0
      }))
    }

    return response
  } catch (error) {
    console.error('Failed to generate task completion report:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate task completion report'
    })
  }
})
