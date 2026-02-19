/**
 * Get Team Member Capacity
 * GET /api/agency/capacity/team/:id
 *
 * Query params:
 * - weeks: Number of weeks to show (default 8, max 12)
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const teamMemberId = getRouterParam(event, 'id')
  const query = getQuery(event)

  if (!teamMemberId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Team member ID is required'
    })
  }

  const weeks = Math.min(Number(query.weeks) || 8, 12)

  try {
    // Get Monday of current week
    const currentWeekStart = await queryOne(`
      SELECT DATE_TRUNC('week', CURRENT_DATE)::DATE AS week_start
    `, [])

    const weekStart = currentWeekStart?.week_start

    // Get team member details
    const teamMember = await queryOne(`
      SELECT
        tm.id,
        tm.name,
        tm.email,
        tm.default_hourly_rate,
        tm.is_active,
        d.id AS department_id,
        d.name AS department_name
      FROM team_members tm
      LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
      LEFT JOIN departments d ON dm.department_id = d.id
      WHERE tm.id = $1
    `, [teamMemberId])

    if (!teamMember) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Team member not found'
      })
    }

    // Get skills
    const skills = await queryRows(`
      SELECT
        skill_name,
        skill_category,
        proficiency_level,
        years_experience,
        is_primary
      FROM team_member_skills
      WHERE team_member_id = $1
      ORDER BY is_primary DESC, skill_category, skill_name
    `, [teamMemberId])

    // Get forecasts for the requested weeks
    const forecasts = await queryRows(`
      SELECT
        week_start,
        week_end,
        base_capacity_hours,
        adjusted_capacity_hours,
        committed_hours,
        tentative_hours,
        available_hours,
        planned_utilization,
        target_utilization,
        capacity_status,
        project_breakdown,
        calculated_at
      FROM resource_forecasts
      WHERE team_member_id = $1
        AND week_start >= $2
        AND week_start < $2 + INTERVAL '${weeks} weeks'
      ORDER BY week_start
    `, [teamMemberId, weekStart])

    // Get upcoming time off
    const timeOff = await queryRows(`
      SELECT
        id,
        adjustment_type,
        title,
        start_date,
        end_date,
        hours_per_day,
        adjusted_hours_per_day,
        is_approved
      FROM capacity_adjustments
      WHERE team_member_id = $1
        AND end_date >= CURRENT_DATE
        AND is_approved = true
      ORDER BY start_date
      LIMIT 10
    `, [teamMemberId])

    // Calculate summary stats
    const avgUtilization = forecasts.length > 0
      ? forecasts.reduce((sum, f) => sum + Number(f.planned_utilization || 0), 0) / forecasts.length
      : 0

    const totalAvailable = forecasts.reduce((sum, f) => sum + Number(f.available_hours || 0), 0)
    const totalCommitted = forecasts.reduce((sum, f) => sum + Number(f.committed_hours || 0), 0)

    return {
      teamMember: {
        id: teamMember.id,
        name: teamMember.name,
        email: teamMember.email,
        hourlyRate: teamMember.default_hourly_rate,
        isActive: teamMember.is_active,
        department: teamMember.department_id ? {
          id: teamMember.department_id,
          name: teamMember.department_name
        } : null
      },
      skills: skills.map(s => ({
        name: s.skill_name,
        category: s.skill_category,
        proficiency: s.proficiency_level,
        yearsExperience: s.years_experience,
        isPrimary: s.is_primary
      })),
      summary: {
        avgUtilization: Math.round(avgUtilization * 10) / 10,
        totalAvailableHours: totalAvailable,
        totalCommittedHours: totalCommitted,
        weeksForecasted: forecasts.length
      },
      weeks: forecasts.map(f => ({
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
      })),
      timeOff: timeOff.map(t => ({
        id: t.id,
        type: t.adjustment_type,
        title: t.title,
        startDate: t.start_date,
        endDate: t.end_date,
        hoursPerDay: t.hours_per_day,
        adjustedHoursPerDay: t.adjusted_hours_per_day,
        isApproved: t.is_approved
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch team member capacity:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch team member capacity'
    })
  }
})
