/**
 * Recalculate Resource Forecasts
 * POST /api/agency/capacity/recalculate
 *
 * Triggers recalculation of resource forecasts
 *
 * Body:
 * - teamMemberId: Specific team member (optional, all if not provided)
 * - weeksAhead: Number of weeks to forecast (default 8, max 12)
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface RecalculateBody {
  teamMemberId?: string
  weeksAhead?: number
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody<RecalculateBody>(event)

  const weeksAhead = Math.min(body.weeksAhead || 8, 12)

  try {
    // Get Monday of current week
    const currentWeek = await queryOne(`
      SELECT DATE_TRUNC('week', CURRENT_DATE)::DATE AS week_start
    `, [])
    const weekStart = currentWeek?.week_start

    let forecastCount = 0
    let memberCount = 0

    if (body.teamMemberId) {
      // Recalculate for specific team member
      const teamMember = await queryOne(`
        SELECT id, name FROM team_members WHERE id = $1 AND is_active = true
      `, [body.teamMemberId])

      if (!teamMember) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Team member not found or inactive'
        })
      }

      // Calculate for each week
      for (let i = 0; i < weeksAhead; i++) {
        await queryOne(`SELECT calculate_member_forecast($1, $2::DATE + $3 * INTERVAL '1 week')`, [
          body.teamMemberId,
          weekStart,
          i
        ])
        forecastCount++
      }
      memberCount = 1
    } else {
      // Recalculate for all active team members
      const result = await queryOne(`SELECT generate_all_forecasts($1) AS count`, [weeksAhead])
      forecastCount = result?.count || 0

      const members = await queryOne(`SELECT COUNT(*) AS count FROM team_members WHERE is_active = true`, [])
      memberCount = members?.count || 0
    }

    // Get summary of recalculated forecasts
    const summary = await queryOne(`
      SELECT
        COUNT(DISTINCT team_member_id) AS members_updated,
        COUNT(*) AS forecasts_created,
        MIN(week_start) AS first_week,
        MAX(week_start) AS last_week,
        ROUND(AVG(planned_utilization)::numeric, 1) AS avg_utilization,
        COUNT(*) FILTER (WHERE capacity_status = 'overloaded') AS overloaded_count
      FROM resource_forecasts
      WHERE calculated_at > NOW() - INTERVAL '1 minute'
    `, [])

    return {
      success: true,
      recalculated: {
        teamMembersProcessed: memberCount,
        forecastsGenerated: forecastCount,
        weeksAhead
      },
      summary: {
        membersUpdated: Number(summary?.members_updated || 0),
        forecastsCreated: Number(summary?.forecasts_created || 0),
        firstWeek: summary?.first_week,
        lastWeek: summary?.last_week,
        avgUtilization: Number(summary?.avg_utilization || 0),
        overloadedCount: Number(summary?.overloaded_count || 0)
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to recalculate forecasts:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to recalculate forecasts'
    })
  }
})
