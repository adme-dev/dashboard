/**
 * Get utilization report
 * GET /api/agency/time/utilization
 *
 * Query params:
 * - userId: Filter by specific user
 * - departmentId: Filter by department
 * - startDate: Start date (YYYY-MM-DD)
 * - endDate: End date (YYYY-MM-DD)
 * - period: 'week' | 'month' | 'quarter' | 'year'
 * - groupBy: 'user' | 'department' | 'project'
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)

  // Default to current month
  const now = new Date()
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const startDate = query.startDate || defaultStartDate.toISOString().split('T')[0]
  const endDate = query.endDate || defaultEndDate.toISOString().split('T')[0]
  const groupBy = query.groupBy || 'user'

  // Build filters
  const conditions: string[] = ['te.date >= $1', 'te.date <= $2']
  const params: any[] = [startDate, endDate]
  let idx = 3

  if (query.userId) {
    conditions.push(`te.user_id = $${idx}`)
    params.push(query.userId)
    idx++
  }

  if (query.departmentId) {
    conditions.push(`dm.department_id = $${idx}`)
    params.push(query.departmentId)
    idx++
  }

  const whereClause = conditions.join(' AND ')

  // Get utilization by user
  const utilizationByUser = await queryRows(`
    SELECT
      tm.id AS user_id,
      tm.name AS user_name,
      tm.email AS user_email,
      tm.target_utilization,
      d.id AS department_id,
      d.name AS department_name,
      COALESCE(SUM(te.hours), 0) AS total_hours,
      COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) AS billable_hours,
      COALESCE(SUM(CASE WHEN NOT te.billable THEN te.hours ELSE 0 END), 0) AS non_billable_hours,
      CASE
        WHEN COALESCE(SUM(te.hours), 0) > 0
        THEN ROUND((COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) / COALESCE(SUM(te.hours), 0) * 100)::numeric, 1)
        ELSE 0
      END AS utilization_rate,
      COALESCE(SUM(te.hours * te.hourly_rate), 0) AS total_value,
      COALESCE(SUM(CASE WHEN te.billable THEN te.hours * te.hourly_rate ELSE 0 END), 0) AS billable_value,
      COUNT(DISTINCT te.project_id) AS projects_worked,
      COUNT(DISTINCT te.date) AS days_worked
    FROM team_members tm
    LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
    LEFT JOIN departments d ON dm.department_id = d.id
    LEFT JOIN time_entries te ON tm.id = te.user_id AND ${whereClause}
    WHERE tm.is_active = true
    GROUP BY tm.id, tm.name, tm.email, tm.target_utilization, d.id, d.name
    ORDER BY utilization_rate DESC
  `, params)

  // Get overall summary
  const summary = await queryOne(`
    SELECT
      COALESCE(SUM(te.hours), 0) AS total_hours,
      COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) AS billable_hours,
      COALESCE(SUM(CASE WHEN NOT te.billable THEN te.hours ELSE 0 END), 0) AS non_billable_hours,
      CASE
        WHEN COALESCE(SUM(te.hours), 0) > 0
        THEN ROUND((COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) / COALESCE(SUM(te.hours), 0) * 100)::numeric, 1)
        ELSE 0
      END AS overall_utilization,
      COALESCE(SUM(te.hours * te.hourly_rate), 0) AS total_value,
      COALESCE(SUM(CASE WHEN te.billable THEN te.hours * te.hourly_rate ELSE 0 END), 0) AS billable_value,
      COUNT(DISTINCT te.user_id) AS active_users,
      COUNT(DISTINCT te.project_id) AS projects_worked
    FROM time_entries te
    LEFT JOIN department_members dm ON te.user_id = dm.team_member_id AND dm.is_primary = true
    WHERE ${whereClause}
  `, params)

  // Get daily breakdown
  const dailyBreakdown = await queryRows(`
    SELECT
      te.date,
      COALESCE(SUM(te.hours), 0) AS total_hours,
      COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) AS billable_hours,
      COUNT(DISTINCT te.user_id) AS active_users
    FROM time_entries te
    LEFT JOIN department_members dm ON te.user_id = dm.team_member_id AND dm.is_primary = true
    WHERE ${whereClause}
    GROUP BY te.date
    ORDER BY te.date
  `, params)

  // Get top projects by hours
  const topProjects = await queryRows(`
    SELECT
      p.id AS project_id,
      p.name AS project_name,
      c.name AS client_name,
      COALESCE(SUM(te.hours), 0) AS total_hours,
      COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) AS billable_hours,
      COALESCE(SUM(te.hours * te.hourly_rate), 0) AS total_value,
      COUNT(DISTINCT te.user_id) AS team_members
    FROM time_entries te
    JOIN projects p ON te.project_id = p.id
    JOIN agency_clients c ON p.client_id = c.id
    LEFT JOIN department_members dm ON te.user_id = dm.team_member_id AND dm.is_primary = true
    WHERE ${whereClause}
    GROUP BY p.id, p.name, c.name
    ORDER BY total_hours DESC
    LIMIT 10
  `, params)

  // Calculate target vs actual
  const targetHoursPerWeek = 40
  const weeksInPeriod = Math.ceil(
    (new Date(endDate as string).getTime() - new Date(startDate as string).getTime()) / (7 * 24 * 60 * 60 * 1000)
  )
  const targetTotalHours = targetHoursPerWeek * weeksInPeriod * (utilizationByUser.length || 1)
  const targetBillablePercent = 75 // Default target

  return {
    period: {
      startDate,
      endDate,
      weeksInPeriod
    },
    summary: {
      totalHours: Number(summary?.total_hours || 0),
      billableHours: Number(summary?.billable_hours || 0),
      nonBillableHours: Number(summary?.non_billable_hours || 0),
      overallUtilization: Number(summary?.overall_utilization || 0),
      totalValue: Number(summary?.total_value || 0),
      billableValue: Number(summary?.billable_value || 0),
      activeUsers: Number(summary?.active_users || 0),
      projectsWorked: Number(summary?.projects_worked || 0),
      targetUtilization: targetBillablePercent,
      utilizationVsTarget: Number(summary?.overall_utilization || 0) - targetBillablePercent
    },
    byUser: utilizationByUser.map(u => ({
      userId: u.user_id,
      userName: u.user_name,
      userEmail: u.user_email,
      departmentId: u.department_id,
      departmentName: u.department_name,
      totalHours: Number(u.total_hours),
      billableHours: Number(u.billable_hours),
      nonBillableHours: Number(u.non_billable_hours),
      utilizationRate: Number(u.utilization_rate),
      targetUtilization: Number(u.target_utilization || targetBillablePercent),
      utilizationVsTarget: Number(u.utilization_rate) - Number(u.target_utilization || targetBillablePercent),
      totalValue: Number(u.total_value),
      billableValue: Number(u.billable_value),
      projectsWorked: Number(u.projects_worked),
      daysWorked: Number(u.days_worked)
    })),
    dailyBreakdown: dailyBreakdown.map(d => ({
      date: d.date,
      totalHours: Number(d.total_hours),
      billableHours: Number(d.billable_hours),
      activeUsers: Number(d.active_users)
    })),
    topProjects: topProjects.map(p => ({
      projectId: p.project_id,
      projectName: p.project_name,
      clientName: p.client_name,
      totalHours: Number(p.total_hours),
      billableHours: Number(p.billable_hours),
      totalValue: Number(p.total_value),
      teamMembers: Number(p.team_members)
    }))
  }
})
