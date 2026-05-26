/**
 * Get Team Members
 * GET /api/agency/team-members
 */

import { createError, getQuery } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

type TeamMemberRow = {
  id: string
  name: string
  email: string
  role: string | null
  department: string | null
  hourly_rate: string | number | null
  hourly_cost: string | number | null
  target_utilization: string | number | null
  avatar_url: string | null
  is_active: boolean
  hours_this_month: string | number | null
  billable_hours_this_month: string | number | null
  utilization_rate: string | number | null
  active_projects: string | number | null
  created_at: string
}

function formatMembers(members: TeamMemberRow[]) {
  return members.map(m => ({
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
    createdAt: m.created_at,
    initials: m.name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }))
}

async function fetchMembers(filters: {
  search: string
  active?: string
  department?: string
  role?: string
}) {
  const currentPeriod = new Date().toISOString().slice(0, 7)
  const params: Array<string | boolean> = [currentPeriod]
  const conditions: string[] = []
  let paramIndex = 2

  if (filters.search) {
    conditions.push(`AND (tm.name ILIKE $${paramIndex} OR tm.email ILIKE $${paramIndex} OR tm.user_role::text ILIKE $${paramIndex} OR tm.role ILIKE $${paramIndex})`)
    params.push(`%${filters.search}%`)
    paramIndex++
  }

  if (filters.active !== undefined && filters.active !== '') {
    conditions.push(`AND tm.is_active = $${paramIndex}`)
    params.push(filters.active === 'true')
    paramIndex++
  } else if (filters.active === undefined) {
    conditions.push('AND tm.is_active = true')
  }

  if (filters.department) {
    conditions.push(`AND d.name = $${paramIndex}`)
    params.push(filters.department)
    paramIndex++
  }

  if (filters.role) {
    conditions.push(`AND COALESCE(tm.role, tm.user_role::text) = $${paramIndex}`)
    params.push(filters.role)
    paramIndex++
  }

  return queryRows<TeamMemberRow>(`
    SELECT
      tm.id,
      tm.name,
      tm.email,
      COALESCE(tm.role, tm.user_role::text) AS role,
      d.name AS department,
      tm.default_hourly_rate AS hourly_rate,
      0 AS hourly_cost,
      tm.target_utilization,
      tm.avatar_url,
      tm.is_active,
      tm.created_at,
      COALESCE(hours.total_hours, 0) AS hours_this_month,
      COALESCE(hours.billable_hours, 0) AS billable_hours_this_month,
      CASE
        WHEN tm.target_utilization > 0
        THEN ROUND((COALESCE(hours.billable_hours, 0) / tm.target_utilization * 100)::numeric, 1)
        ELSE 0
      END AS utilization_rate,
      COALESCE(projects.active_projects, 0) AS active_projects
    FROM team_members tm
    LEFT JOIN departments d ON d.id = tm.department_id
    LEFT JOIN (
      SELECT
        user_id,
        SUM(hours) AS total_hours,
        SUM(CASE WHEN billable THEN hours ELSE 0 END) AS billable_hours
      FROM time_entries
      WHERE TO_CHAR(date, 'YYYY-MM') = $1
      GROUP BY user_id
    ) hours ON tm.id = hours.user_id
    LEFT JOIN (
      SELECT
        te.user_id,
        COUNT(DISTINCT p.id) AS active_projects
      FROM time_entries te
      JOIN projects p ON te.project_id = p.id
      WHERE p.status = 'active'
        AND te.date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY te.user_id
    ) projects ON tm.id = projects.user_id
    WHERE 1=1
    ${conditions.join('\n')}
    ORDER BY tm.name ASC
  `, params)
}

export default eventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const search = (query.search as string) || ''
  const active = typeof query.active === 'string' ? query.active : undefined
  const department = typeof query.department === 'string' ? query.department : undefined
  const role = typeof query.role === 'string' ? query.role : undefined

  try {
    const rows = await fetchMembers({ search, active, department, role })
    const members = formatMembers(rows)
    const activeMembers = members.filter(member => member.isActive)
    const totalCapacity = activeMembers.reduce((sum, member) => sum + member.targetUtilization, 0)
    const totalBillableHours = members.reduce((sum, member) => sum + member.billableHoursThisMonth, 0)
    const avgUtilization = activeMembers.length > 0
      ? activeMembers.reduce((sum, member) => sum + member.utilizationRate, 0) / activeMembers.length
      : 0

    return {
      members,
      summary: {
        total: members.length,
        active: activeMembers.length,
        totalCapacity,
        totalBillableHours,
        avgUtilization: Math.round(avgUtilization)
      },
      departments: [...new Set(members.map(member => member.department).filter(Boolean))],
      roles: [...new Set(members.map(member => member.role).filter(Boolean))]
    }
  } catch (error: unknown) {
    console.error('Failed to fetch team members:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to fetch team members: ${message}`
    })
  }
})
