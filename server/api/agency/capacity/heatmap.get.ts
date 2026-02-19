/**
 * Get Capacity Heatmap
 * GET /api/agency/capacity/heatmap
 *
 * Returns a matrix of team members x weeks for visual capacity display
 *
 * Query params:
 * - weeks: Number of weeks (default 8, max 12)
 * - departmentId: Filter by department
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const weeks = Math.min(Number(query.weeks) || 8, 12)

  try {
    // Get Monday of current week
    const currentWeekStart = await queryOne(`
      SELECT DATE_TRUNC('week', CURRENT_DATE)::DATE AS week_start
    `, [])

    const weekStart = currentWeekStart?.week_start

    // Build conditions
    const conditions: string[] = [
      'rf.week_start >= $1',
      `rf.week_start < $1 + INTERVAL '${weeks} weeks'`,
      'tm.is_active = true'
    ]
    const params: any[] = [weekStart]
    let idx = 2

    if (query.departmentId) {
      conditions.push(`dm.department_id = $${idx++}`)
      params.push(query.departmentId)
    }

    const whereClause = conditions.join(' AND ')

    // Get all forecasts for heatmap
    const forecasts = await queryRows(`
      SELECT
        rf.team_member_id,
        tm.name AS team_member_name,
        d.id AS department_id,
        d.name AS department_name,
        rf.week_start,
        rf.planned_utilization,
        rf.capacity_status,
        rf.available_hours,
        rf.committed_hours
      FROM resource_forecasts rf
      JOIN team_members tm ON rf.team_member_id = tm.id
      LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
      LEFT JOIN departments d ON dm.department_id = d.id
      WHERE ${whereClause}
      ORDER BY tm.name, rf.week_start
    `, params)

    // Generate week headers
    const weekHeaders: Array<{ weekStart: string; weekEnd: string; label: string }> = []
    for (let i = 0; i < weeks; i++) {
      const start = new Date(weekStart)
      start.setDate(start.getDate() + (i * 7))
      const end = new Date(start)
      end.setDate(end.getDate() + 6)

      weekHeaders.push({
        weekStart: start.toISOString().split('T')[0]!,
        weekEnd: end.toISOString().split('T')[0]!,
        label: `Week ${i + 1}`
      })
    }

    // Group by team member for heatmap rows
    const teamMemberMap = new Map<string, any>()

    for (const f of forecasts) {
      if (!teamMemberMap.has(f.team_member_id)) {
        teamMemberMap.set(f.team_member_id, {
          id: f.team_member_id,
          name: f.team_member_name,
          department: f.department_id ? {
            id: f.department_id,
            name: f.department_name
          } : null,
          cells: new Map<string, any>()
        })
      }

      const weekKey = f.week_start.toISOString().split('T')[0]
      teamMemberMap.get(f.team_member_id).cells.set(weekKey, {
        utilization: f.planned_utilization,
        status: f.capacity_status,
        available: f.available_hours,
        committed: f.committed_hours
      })
    }

    // Convert to array format for response
    const rows = Array.from(teamMemberMap.values()).map(member => ({
      teamMember: {
        id: member.id,
        name: member.name,
        department: member.department
      },
      cells: weekHeaders.map(week => {
        const cell = member.cells.get(week.weekStart)
        return {
          weekStart: week.weekStart,
          utilization: cell?.utilization ?? null,
          status: cell?.status ?? 'unknown',
          available: cell?.available ?? null,
          committed: cell?.committed ?? null
        }
      })
    }))

    // Calculate column summaries
    const columnSummaries = weekHeaders.map(week => {
      const weekForecasts = forecasts.filter(f =>
        f.week_start.toISOString().split('T')[0] === week.weekStart
      )

      const totalAvailable = weekForecasts.reduce((sum, f) => sum + Number(f.available_hours || 0), 0)
      const totalCommitted = weekForecasts.reduce((sum, f) => sum + Number(f.committed_hours || 0), 0)
      const avgUtilization = weekForecasts.length > 0
        ? weekForecasts.reduce((sum, f) => sum + Number(f.planned_utilization || 0), 0) / weekForecasts.length
        : 0

      const statusCounts = {
        available: weekForecasts.filter(f => f.capacity_status === 'available').length,
        balanced: weekForecasts.filter(f => f.capacity_status === 'balanced').length,
        busy: weekForecasts.filter(f => f.capacity_status === 'busy').length,
        overloaded: weekForecasts.filter(f => f.capacity_status === 'overloaded').length
      }

      return {
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        label: week.label,
        totalAvailable,
        totalCommitted,
        avgUtilization: Math.round(avgUtilization * 10) / 10,
        teamCount: weekForecasts.length,
        statusCounts
      }
    })

    return {
      weeks: weekHeaders,
      rows,
      columnSummaries,
      legend: {
        available: { label: 'Available', color: '#22c55e', range: '< 60%' },
        balanced: { label: 'Balanced', color: '#3b82f6', range: '60-85%' },
        busy: { label: 'Busy', color: '#f59e0b', range: '85-100%' },
        overloaded: { label: 'Overloaded', color: '#ef4444', range: '> 100%' }
      }
    }
  } catch (error) {
    console.error('Failed to fetch capacity heatmap:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch capacity heatmap'
    })
  }
})
