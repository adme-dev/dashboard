/**
 * Find Available Resources
 * GET /api/agency/capacity/availability
 *
 * Find team members with availability for scheduling work
 *
 * Query params:
 * - hoursNeeded: Minimum hours needed (default 1)
 * - weekStart: Specific week to check (default current week)
 * - weeksAhead: Number of weeks to search (default 4, max 8)
 * - skills: Comma-separated skill names to filter by
 * - departmentId: Filter by department
 * - minAvailability: Minimum availability percentage (0-100)
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const hoursNeeded = Number(query.hoursNeeded) || 1
  const weeksAhead = Math.min(Number(query.weeksAhead) || 4, 8)
  const minAvailability = Number(query.minAvailability) || 0
  const skills = query.skills
    ? String(query.skills).split(',').map(s => s.trim().toLowerCase())
    : null

  try {
    // Get week start
    let weekStart: string
    if (query.weekStart) {
      weekStart = String(query.weekStart)
    } else {
      const currentWeek = await queryOne(`
        SELECT DATE_TRUNC('week', CURRENT_DATE)::DATE AS week_start
      `, [])
      weekStart = currentWeek?.week_start
    }

    // Build conditions
    const conditions: string[] = [
      'rf.week_start >= $1',
      `rf.week_start < $1::DATE + INTERVAL '${weeksAhead} weeks'`,
      'rf.available_hours >= $2',
      'tm.is_active = true'
    ]
    const params: any[] = [weekStart, hoursNeeded]
    let idx = 3

    if (query.departmentId) {
      conditions.push(`dm.department_id = $${idx++}`)
      params.push(query.departmentId)
    }

    if (minAvailability > 0) {
      // Available means utilization is below (100 - minAvailability)
      const maxUtilization = 100 - minAvailability
      conditions.push(`rf.planned_utilization <= $${idx++}`)
      params.push(maxUtilization)
    }

    const whereClause = conditions.join(' AND ')

    // Get available resources
    const resources = await queryRows(`
      SELECT
        rf.team_member_id,
        tm.name AS team_member_name,
        tm.email AS team_member_email,
        tm.default_hourly_rate,
        d.id AS department_id,
        d.name AS department_name,
        rf.week_start,
        rf.week_end,
        rf.available_hours,
        rf.planned_utilization,
        rf.capacity_status,
        rf.adjusted_capacity_hours
      FROM resource_forecasts rf
      JOIN team_members tm ON rf.team_member_id = tm.id
      LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
      LEFT JOIN departments d ON dm.department_id = d.id
      WHERE ${whereClause}
      ORDER BY rf.available_hours DESC, tm.name, rf.week_start
    `, params)

    // Get skills for all found team members
    const memberIds = [...new Set(resources.map(r => r.team_member_id))]

    let skillsMap = new Map<string, string[]>()
    if (memberIds.length > 0) {
      const memberSkills = await queryRows(`
        SELECT team_member_id, skill_name, skill_category
        FROM team_member_skills
        WHERE team_member_id = ANY($1)
        ORDER BY is_primary DESC, skill_name
      `, [memberIds])

      for (const skill of memberSkills) {
        const existing = skillsMap.get(skill.team_member_id) || []
        existing.push(skill.skill_name)
        skillsMap.set(skill.team_member_id, existing)
      }
    }

    // Filter by skills if requested
    let filteredResources = resources
    if (skills && skills.length > 0) {
      filteredResources = resources.filter(r => {
        const memberSkillsList = skillsMap.get(r.team_member_id) || []
        const lowerSkills = memberSkillsList.map(s => s.toLowerCase())
        return skills.some(skill => lowerSkills.includes(skill))
      })
    }

    // Group by team member
    const byMember = new Map<string, any>()

    for (const r of filteredResources) {
      if (!byMember.has(r.team_member_id)) {
        byMember.set(r.team_member_id, {
          teamMember: {
            id: r.team_member_id,
            name: r.team_member_name,
            email: r.team_member_email,
            hourlyRate: r.default_hourly_rate
          },
          department: r.department_id ? {
            id: r.department_id,
            name: r.department_name
          } : null,
          skills: skillsMap.get(r.team_member_id) || [],
          availability: [],
          totalAvailableHours: 0
        })
      }

      const member = byMember.get(r.team_member_id)
      member.availability.push({
        weekStart: r.week_start,
        weekEnd: r.week_end,
        availableHours: r.available_hours,
        utilization: r.planned_utilization,
        status: r.capacity_status,
        capacity: r.adjusted_capacity_hours
      })
      member.totalAvailableHours += Number(r.available_hours || 0)
    }

    // Sort by total available hours
    const results = Array.from(byMember.values())
      .sort((a, b) => b.totalAvailableHours - a.totalAvailableHours)

    // Summary
    const totalAvailable = results.reduce((sum, r) => sum + r.totalAvailableHours, 0)
    const uniqueMembers = results.length

    return {
      results,
      summary: {
        totalAvailableHours: totalAvailable,
        teamMembersFound: uniqueMembers,
        weeksSearched: weeksAhead,
        hoursNeeded,
        canFulfill: totalAvailable >= hoursNeeded
      },
      searchCriteria: {
        weekStart,
        weeksAhead,
        hoursNeeded,
        skills: skills || [],
        departmentId: query.departmentId || null,
        minAvailability
      }
    }
  } catch (error) {
    console.error('Failed to find available resources:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to find available resources'
    })
  }
})
