/**
 * Get Capacity Forecast
 * GET /api/agency/capacity/forecast
 *
 * Query params:
 * - weeks: Number of weeks to forecast (default 8, max 12)
 * - departmentId: Filter by department
 * - status: Filter by capacity status (available, balanced, busy, overloaded)
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

    if (query.status) {
      conditions.push(`rf.capacity_status = $${idx++}`)
      params.push(query.status)
    }

    const whereClause = conditions.join(' AND ')

    // Get forecasts
    const forecasts = await queryRows(`
      SELECT
        rf.id,
        rf.team_member_id,
        tm.name AS team_member_name,
        tm.email AS team_member_email,
        d.id AS department_id,
        d.name AS department_name,
        rf.week_start,
        rf.week_end,
        rf.base_capacity_hours,
        rf.adjusted_capacity_hours,
        rf.committed_hours,
        rf.tentative_hours,
        rf.available_hours,
        rf.planned_utilization,
        rf.target_utilization,
        rf.capacity_status,
        rf.project_breakdown,
        rf.calculated_at
      FROM resource_forecasts rf
      JOIN team_members tm ON rf.team_member_id = tm.id
      LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
      LEFT JOIN departments d ON dm.department_id = d.id
      WHERE ${whereClause}
      ORDER BY tm.name, rf.week_start
    `, params)

    // Group by team member
    const byMember = new Map<string, any>()

    for (const f of forecasts) {
      if (!byMember.has(f.team_member_id)) {
        byMember.set(f.team_member_id, {
          teamMember: {
            id: f.team_member_id,
            name: f.team_member_name,
            email: f.team_member_email
          },
          department: f.department_id ? {
            id: f.department_id,
            name: f.department_name
          } : null,
          weeks: []
        })
      }

      byMember.get(f.team_member_id).weeks.push({
        weekStart: f.week_start,
        weekEnd: f.week_end,
        baseCapacity: f.base_capacity_hours,
        adjustedCapacity: f.adjusted_capacity_hours,
        committed: f.committed_hours,
        tentative: f.tentative_hours,
        available: f.available_hours,
        utilization: f.planned_utilization,
        targetUtilization: f.target_utilization,
        status: f.capacity_status,
        projects: f.project_breakdown,
        calculatedAt: f.calculated_at
      })
    }

    // Get summary by week
    const weeklySummary = await queryRows(`
      SELECT
        rf.week_start,
        COUNT(DISTINCT rf.team_member_id) AS team_count,
        SUM(rf.adjusted_capacity_hours) AS total_capacity,
        SUM(rf.committed_hours) AS total_committed,
        SUM(rf.available_hours) AS total_available,
        ROUND(AVG(rf.planned_utilization)::numeric, 1) AS avg_utilization,
        COUNT(*) FILTER (WHERE rf.capacity_status = 'available') AS available_count,
        COUNT(*) FILTER (WHERE rf.capacity_status = 'balanced') AS balanced_count,
        COUNT(*) FILTER (WHERE rf.capacity_status = 'busy') AS busy_count,
        COUNT(*) FILTER (WHERE rf.capacity_status = 'overloaded') AS overloaded_count
      FROM resource_forecasts rf
      JOIN team_members tm ON rf.team_member_id = tm.id
      WHERE rf.week_start >= $1
        AND rf.week_start < $1 + INTERVAL '${weeks} weeks'
        AND tm.is_active = true
      GROUP BY rf.week_start
      ORDER BY rf.week_start
    `, [weekStart])

    return {
      teamMembers: Array.from(byMember.values()),
      weeklySummary: weeklySummary.map(w => ({
        weekStart: w.week_start,
        teamCount: Number(w.team_count),
        totalCapacity: Number(w.total_capacity),
        totalCommitted: Number(w.total_committed),
        totalAvailable: Number(w.total_available),
        avgUtilization: Number(w.avg_utilization),
        byStatus: {
          available: Number(w.available_count),
          balanced: Number(w.balanced_count),
          busy: Number(w.busy_count),
          overloaded: Number(w.overloaded_count)
        }
      }))
    }
  } catch (error) {
    console.error('Failed to fetch capacity forecast:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch capacity forecast'
    })
  }
})
