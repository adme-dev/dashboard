/**
 * Get Team Members
 * GET /api/agency/team-members
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const { active, department, role } = query

  try {
    // Get current period for utilization
    const currentPeriod = new Date().toISOString().slice(0, 7)

    let sql = `
      SELECT
        tm.id,
        tm.name,
        tm.email,
        tm.role,
        tm.department,
        tm.hourly_rate,
        tm.hourly_cost,
        tm.target_utilization,
        tm.avatar_url,
        tm.is_active,
        tm.created_at,
        COALESCE(hours.total_hours, 0) as hours_this_month,
        COALESCE(hours.billable_hours, 0) as billable_hours_this_month,
        CASE
          WHEN tm.target_utilization > 0
          THEN ROUND((COALESCE(hours.billable_hours, 0) / tm.target_utilization * 100)::numeric, 1)
          ELSE 0
        END as utilization_rate,
        COALESCE(projects.active_projects, 0) as active_projects
      FROM team_members tm
      LEFT JOIN (
        SELECT
          user_id,
          SUM(hours) as total_hours,
          SUM(CASE WHEN billable THEN hours ELSE 0 END) as billable_hours
        FROM time_entries
        WHERE TO_CHAR(date, 'YYYY-MM') = $1
        GROUP BY user_id
      ) hours ON tm.id = hours.user_id
      LEFT JOIN (
        SELECT
          te.user_id,
          COUNT(DISTINCT p.id) as active_projects
        FROM time_entries te
        JOIN projects p ON te.project_id = p.id
        WHERE p.status = 'active'
          AND te.date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY te.user_id
      ) projects ON tm.id = projects.user_id
      WHERE 1=1
    `

    const params: any[] = [currentPeriod]
    let paramIndex = 2

    if (active !== undefined) {
      sql += ` AND tm.is_active = $${paramIndex}`
      params.push(active === 'true')
      paramIndex++
    }

    if (department) {
      sql += ` AND tm.department = $${paramIndex}`
      params.push(department)
      paramIndex++
    }

    if (role) {
      sql += ` AND tm.role = $${paramIndex}`
      params.push(role)
      paramIndex++
    }

    sql += ' ORDER BY tm.name'

    const members = await queryRows(sql, params)

    // Get summary stats
    const activeMembers = members.filter(m => m.is_active)
    const totalCapacity = activeMembers.reduce((sum, m) => sum + Number(m.target_utilization || 0), 0)
    const totalBillableHours = members.reduce((sum, m) => sum + Number(m.billable_hours_this_month || 0), 0)
    const avgUtilization = activeMembers.length > 0
      ? activeMembers.reduce((sum, m) => sum + Number(m.utilization_rate || 0), 0) / activeMembers.length
      : 0

    // Get unique departments and roles
    const departments = [...new Set(members.map(m => m.department).filter(Boolean))]
    const roles = [...new Set(members.map(m => m.role).filter(Boolean))]

    return {
      members: members.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        department: m.department,
        hourlyRate: Number(m.hourly_rate || 0),
        hourlyCost: Number(m.hourly_cost || 0),
        targetUtilization: Number(m.target_utilization || 0),
        avatarUrl: m.avatar_url,
        isActive: m.is_active,
        hoursThisMonth: Number(m.hours_this_month || 0),
        billableHoursThisMonth: Number(m.billable_hours_this_month || 0),
        utilizationRate: Number(m.utilization_rate || 0),
        activeProjects: Number(m.active_projects || 0),
        createdAt: m.created_at
      })),
      summary: {
        total: members.length,
        active: activeMembers.length,
        totalCapacity,
        totalBillableHours,
        avgUtilization: Math.round(avgUtilization)
      },
      departments,
      roles
    }
  } catch (error) {
    console.error('Failed to fetch team members:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch team members'
    })
  }
})
