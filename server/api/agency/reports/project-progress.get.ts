/**
 * Project Progress Report
 * GET /api/agency/reports/project-progress
 *
 * Returns progress metrics for all projects or a specific project
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface ProjectProgress {
  projectId: string
  projectName: string
  clientId: string | null
  clientName: string | null
  status: string
  startDate: string | null
  dueDate: string | null
  totalTasks: number
  completedTasks: number
  inProgressTasks: number
  blockedTasks: number
  progressPercent: number
  estimatedHours: number
  actualHours: number
  hoursVariance: number
  isOverdue: boolean
  daysRemaining: number | null
  health: 'healthy' | 'at_risk' | 'critical'
  statusBreakdown: Array<{
    statusId: string
    statusName: string
    statusColor: string
    count: number
  }>
}

interface ProjectProgressResponse {
  projects: ProjectProgress[]
  summary: {
    totalProjects: number
    onTrack: number
    atRisk: number
    critical: number
    overdue: number
    averageProgress: number
  }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const projectId = query.projectId as string | undefined
  const clientId = query.clientId as string | undefined
  const status = query.status as string | undefined
  const includeCompleted = query.includeCompleted === 'true'

  try {
    // Build conditions
    const conditions: string[] = []
    const params: string[] = []
    let paramIdx = 1

    if (projectId) {
      conditions.push(`p.id = $${paramIdx}`)
      params.push(projectId)
      paramIdx++
    }

    if (clientId) {
      conditions.push(`p.client_id = $${paramIdx}`)
      params.push(clientId)
      paramIdx++
    }

    if (status) {
      conditions.push(`p.status = $${paramIdx}`)
      params.push(status)
      paramIdx++
    }

    if (!includeCompleted) {
      conditions.push(`p.status != 'completed'`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get project progress data
    const projectsQuery = `
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        p.client_id,
        c.name AS client_name,
        p.status,
        p.start_date,
        p.due_date,
        COUNT(t.id) AS total_tasks,
        COUNT(t.id) FILTER (WHERE ts.is_final = true) AS completed_tasks,
        COUNT(t.id) FILTER (
          WHERE ts.category = 'in_progress' OR ts.category = 'review'
        ) AS in_progress_tasks,
        COUNT(t.id) FILTER (WHERE t.is_blocked = true) AS blocked_tasks,
        COALESCE(SUM(t.estimated_hours), 0) AS estimated_hours,
        COALESCE(SUM(t.actual_hours), 0) AS actual_hours,
        CASE
          WHEN COUNT(t.id) > 0
          THEN ROUND(
            COUNT(t.id) FILTER (WHERE ts.is_final = true)::numeric /
            COUNT(t.id)::numeric * 100, 0
          )
          ELSE 0
        END AS progress_percent
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN tasks t ON t.project_id = p.id
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      ${whereClause}
      GROUP BY p.id, p.name, p.client_id, c.name, p.status, p.start_date, p.due_date
      ORDER BY
        CASE p.status
          WHEN 'active' THEN 1
          WHEN 'on_hold' THEN 2
          WHEN 'completed' THEN 3
          ELSE 4
        END,
        p.due_date NULLS LAST
    `

    const projectsResult = await queryRows(projectsQuery, params)

    // Get status breakdown for each project
    const statusBreakdownQuery = `
      SELECT
        t.project_id,
        ts.id AS status_id,
        ts.name AS status_name,
        ts.color AS status_color,
        COUNT(*) AS count
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      JOIN projects p ON t.project_id = p.id
      ${whereClause}
      GROUP BY t.project_id, ts.id, ts.name, ts.color
      ORDER BY ts.sort_order
    `

    const statusBreakdownResult = await queryRows(statusBreakdownQuery, params)

    // Build status breakdown map
    const statusBreakdownMap = new Map<string, Array<{
      statusId: string
      statusName: string
      statusColor: string
      count: number
    }>>()

    for (const row of statusBreakdownResult) {
      const projectId = row.project_id
      if (!statusBreakdownMap.has(projectId)) {
        statusBreakdownMap.set(projectId, [])
      }
      statusBreakdownMap.get(projectId)!.push({
        statusId: row.status_id,
        statusName: row.status_name,
        statusColor: row.status_color,
        count: Number(row.count) || 0
      })
    }

    const today = new Date()
    const projects: ProjectProgress[] = projectsResult.map(row => {
      const dueDate = row.due_date ? new Date(row.due_date) : null
      const isOverdue = dueDate ? dueDate < today && row.status !== 'completed' : false
      const daysRemaining = dueDate
        ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : null

      const progressPercent = Number(row.progress_percent) || 0
      const estimatedHours = Number(row.estimated_hours) || 0
      const actualHours = Number(row.actual_hours) || 0
      const hoursVariance = actualHours - estimatedHours
      const blockedTasks = Number(row.blocked_tasks) || 0

      // Determine health
      let health: 'healthy' | 'at_risk' | 'critical'
      if (isOverdue || blockedTasks > 3 || (daysRemaining !== null && daysRemaining < 0)) {
        health = 'critical'
      } else if (
        blockedTasks > 0 ||
        (daysRemaining !== null && daysRemaining < 7 && progressPercent < 80) ||
        hoursVariance > estimatedHours * 0.2
      ) {
        health = 'at_risk'
      } else {
        health = 'healthy'
      }

      return {
        projectId: row.project_id,
        projectName: row.project_name,
        clientId: row.client_id,
        clientName: row.client_name,
        status: row.status,
        startDate: row.start_date,
        dueDate: row.due_date,
        totalTasks: Number(row.total_tasks) || 0,
        completedTasks: Number(row.completed_tasks) || 0,
        inProgressTasks: Number(row.in_progress_tasks) || 0,
        blockedTasks,
        progressPercent,
        estimatedHours,
        actualHours,
        hoursVariance,
        isOverdue,
        daysRemaining,
        health,
        statusBreakdown: statusBreakdownMap.get(row.project_id) || []
      }
    })

    // Calculate summary
    const onTrack = projects.filter(p => p.health === 'healthy').length
    const atRisk = projects.filter(p => p.health === 'at_risk').length
    const critical = projects.filter(p => p.health === 'critical').length
    const overdue = projects.filter(p => p.isOverdue).length
    const averageProgress = projects.length > 0
      ? Math.round(projects.reduce((sum, p) => sum + p.progressPercent, 0) / projects.length)
      : 0

    const response: ProjectProgressResponse = {
      projects,
      summary: {
        totalProjects: projects.length,
        onTrack,
        atRisk,
        critical,
        overdue,
        averageProgress
      }
    }

    return response
  } catch (error) {
    console.error('Failed to generate project progress report:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate project progress report'
    })
  }
})
