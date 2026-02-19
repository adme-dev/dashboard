/**
 * Burndown Report
 * GET /api/agency/reports/burndown
 *
 * Returns burndown chart data for sprints or projects
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface BurndownPoint {
  date: string
  ideal: number
  actual: number
  remaining: number
  completed: number
}

interface BurndownResponse {
  projectId: string | null
  projectName: string | null
  startDate: string
  endDate: string
  totalTasks: number
  completedTasks: number
  remainingTasks: number
  burndownData: BurndownPoint[]
  velocity: {
    daily: number
    projected: number
    onTrack: boolean
  }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const projectId = query.projectId as string | undefined
  const departmentId = query.departmentId as string | undefined
  const dateFrom = query.dateFrom as string | undefined
  const dateTo = query.dateTo as string | undefined

  try {
    // Build conditions
    const conditions: string[] = []
    const params: (string | undefined)[] = []
    let paramIdx = 1

    if (projectId) {
      conditions.push(`t.project_id = $${paramIdx}`)
      params.push(projectId)
      paramIdx++
    }

    if (departmentId) {
      conditions.push(`t.department_id = $${paramIdx}`)
      params.push(departmentId)
      paramIdx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get project info if specified
    let projectInfo = null
    if (projectId) {
      projectInfo = await queryOne(`
        SELECT id, name, start_date, due_date
        FROM projects
        WHERE id = $1
      `, [projectId])
    }

    // Determine date range
    let startDate: Date
    let endDate: Date

    if (dateFrom && dateTo) {
      startDate = new Date(dateFrom)
      endDate = new Date(dateTo)
    } else if (projectInfo?.start_date && projectInfo?.due_date) {
      startDate = new Date(projectInfo.start_date)
      endDate = new Date(projectInfo.due_date)
    } else {
      // Default to last 30 days
      endDate = new Date()
      startDate = new Date()
      startDate.setDate(startDate.getDate() - 30)
    }

    // Get total tasks at start
    const totalTasksQuery = `
      SELECT COUNT(*) as total
      FROM tasks t
      ${whereClause}
    `
    const totalResult = await queryRows(totalTasksQuery, params)
    const totalTasks = Number(totalResult[0]?.total) || 0

    // Get completed tasks count
    const completedQuery = `
      SELECT COUNT(*) as completed
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      ${whereClause}
      ${conditions.length > 0 ? 'AND' : 'WHERE'} ts.is_final = true
    `
    const completedResult = await queryRows(completedQuery, params)
    const completedTasks = Number(completedResult[0]?.completed) || 0
    const remainingTasks = totalTasks - completedTasks

    // Generate burndown data points
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const idealDecrement = totalTasks / Math.max(daysDiff, 1)

    // Get daily completion data
    const dailyCompletionsQuery = `
      SELECT
        DATE_TRUNC('day', t.updated_at)::date as completion_date,
        COUNT(*) as completed_count
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      ${whereClause}
      ${conditions.length > 0 ? 'AND' : 'WHERE'} ts.is_final = true
        AND t.updated_at >= $${paramIdx}::timestamp
        AND t.updated_at <= $${paramIdx + 1}::timestamp
      GROUP BY DATE_TRUNC('day', t.updated_at)
      ORDER BY completion_date
    `

    const dailyCompletions = await queryRows(dailyCompletionsQuery, [
      ...params,
      startDate.toISOString(),
      endDate.toISOString()
    ])

    // Build completion map
    const completionMap = new Map<string, number>()
    for (const row of dailyCompletions) {
      completionMap.set(row.completion_date, Number(row.completed_count) || 0)
    }

    // Generate burndown points
    const burndownData: BurndownPoint[] = []
    let cumulativeCompleted = 0
    const today = new Date()

    for (let i = 0; i <= daysDiff; i++) {
      const currentDate = new Date(startDate)
      currentDate.setDate(currentDate.getDate() + i)
      const dateStr = currentDate.toISOString().split('T')[0]

      // Only include actual data up to today
      const completedToday = completionMap.get(dateStr) || 0
      if (currentDate <= today) {
        cumulativeCompleted += completedToday
      }

      const ideal = Math.max(0, totalTasks - (idealDecrement * i))
      const actual = currentDate <= today ? totalTasks - cumulativeCompleted : totalTasks - cumulativeCompleted
      const remaining = currentDate <= today ? totalTasks - cumulativeCompleted : totalTasks - cumulativeCompleted

      burndownData.push({
        date: dateStr,
        ideal: Math.round(ideal * 10) / 10,
        actual: currentDate <= today ? Math.round(actual * 10) / 10 : 0,
        remaining: currentDate <= today ? remaining : 0,
        completed: currentDate <= today ? cumulativeCompleted : 0
      })
    }

    // Calculate velocity
    const daysElapsed = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const dailyVelocity = daysElapsed > 0 ? cumulativeCompleted / daysElapsed : 0
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
    const projectedCompletion = cumulativeCompleted + (dailyVelocity * daysRemaining)
    const onTrack = projectedCompletion >= totalTasks

    const response: BurndownResponse = {
      projectId: projectId || null,
      projectName: projectInfo?.name || null,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      totalTasks,
      completedTasks,
      remainingTasks,
      burndownData,
      velocity: {
        daily: Math.round(dailyVelocity * 10) / 10,
        projected: Math.round(projectedCompletion),
        onTrack
      }
    }

    return response
  } catch (error) {
    console.error('Failed to generate burndown report:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate burndown report'
    })
  }
})
