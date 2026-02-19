/**
 * Completion Trends Report
 * GET /api/agency/reports/completion-trends
 *
 * Returns historical completion data for trend charts
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface TrendData {
  period: string
  completed: number
  created: number
  netChange: number
  cumulativeCompleted: number
  averageCompletionTime: number
}

interface TrendsResponse {
  trends: TrendData[]
  summary: {
    totalPeriods: number
    averageCompletedPerPeriod: number
    trend: 'up' | 'down' | 'stable'
    trendPercentage: number
  }
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const dateFrom = query.dateFrom as string | undefined
  const dateTo = query.dateTo as string | undefined
  const departmentId = query.departmentId as string | undefined
  const projectId = query.projectId as string | undefined
  const interval = (query.interval as string) || 'day' // day, week, month
  const limit = Math.min(Number(query.limit) || 30, 90)

  try {
    // Build conditions
    const conditions: string[] = []
    const params: (string | number)[] = []
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

    // Get trend data by period
    const intervalTrunc = interval === 'month' ? 'month' : interval === 'week' ? 'week' : 'day'

    const trendsQuery = `
      WITH period_data AS (
        SELECT
          DATE_TRUNC('${intervalTrunc}', t.updated_at)::date AS period,
          COUNT(*) FILTER (WHERE ts.is_final = true) AS completed,
          COUNT(*) FILTER (
            WHERE t.created_at >= DATE_TRUNC('${intervalTrunc}', t.updated_at)
            AND t.created_at < DATE_TRUNC('${intervalTrunc}', t.updated_at) + INTERVAL '1 ${intervalTrunc}'
          ) AS created,
          ROUND(
            AVG(
              CASE WHEN ts.is_final = true
              THEN EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 3600
              END
            )::numeric, 1
          ) AS avg_completion_hours
        FROM tasks t
        LEFT JOIN task_statuses ts ON t.status_id = ts.id
        ${whereClause}
        GROUP BY DATE_TRUNC('${intervalTrunc}', t.updated_at)
        ORDER BY period DESC
        LIMIT ${limit}
      )
      SELECT
        period,
        completed,
        created,
        completed - created AS net_change,
        SUM(completed) OVER (ORDER BY period ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_completed,
        COALESCE(avg_completion_hours, 0) AS avg_completion_hours
      FROM period_data
      ORDER BY period ASC
    `

    const trendsResult = await queryRows(trendsQuery, params)

    // Calculate summary
    const trends: TrendData[] = trendsResult.map(row => ({
      period: row.period,
      completed: Number(row.completed) || 0,
      created: Number(row.created) || 0,
      netChange: Number(row.net_change) || 0,
      cumulativeCompleted: Number(row.cumulative_completed) || 0,
      averageCompletionTime: Number(row.avg_completion_hours) || 0
    }))

    // Calculate trend direction
    let trend: 'up' | 'down' | 'stable' = 'stable'
    let trendPercentage = 0

    if (trends.length >= 2) {
      const recentHalf = trends.slice(Math.floor(trends.length / 2))
      const olderHalf = trends.slice(0, Math.floor(trends.length / 2))

      const recentAvg = recentHalf.reduce((sum, t) => sum + t.completed, 0) / recentHalf.length
      const olderAvg = olderHalf.reduce((sum, t) => sum + t.completed, 0) / olderHalf.length

      if (olderAvg > 0) {
        trendPercentage = Math.round(((recentAvg - olderAvg) / olderAvg) * 100)
        if (trendPercentage > 5) {
          trend = 'up'
        } else if (trendPercentage < -5) {
          trend = 'down'
        }
      }
    }

    const totalCompleted = trends.reduce((sum, t) => sum + t.completed, 0)
    const averageCompletedPerPeriod = trends.length > 0
      ? Math.round(totalCompleted / trends.length * 10) / 10
      : 0

    const response: TrendsResponse = {
      trends,
      summary: {
        totalPeriods: trends.length,
        averageCompletedPerPeriod,
        trend,
        trendPercentage: Math.abs(trendPercentage)
      }
    }

    return response
  } catch (error) {
    console.error('Failed to generate completion trends report:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate completion trends report'
    })
  }
})
