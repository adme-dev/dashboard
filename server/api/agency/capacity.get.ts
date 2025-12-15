/**
 * Team Capacity & Resource Planning
 * GET /api/agency/capacity
 *
 * Query params:
 * - startDate: Start of planning period
 * - endDate: End of planning period
 * - departmentId: Filter by department
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  // Default to next 4 weeks
  const now = new Date()
  const defaultStart = new Date(now)
  defaultStart.setDate(defaultStart.getDate() - defaultStart.getDay() + 1) // Start of current week (Monday)
  const defaultEnd = new Date(defaultStart)
  defaultEnd.setDate(defaultEnd.getDate() + 28) // 4 weeks out

  const startDate = (query.startDate as string) || defaultStart.toISOString().split('T')[0]
  const endDate = (query.endDate as string) || defaultEnd.toISOString().split('T')[0]
  const departmentId = query.departmentId as string | undefined

  try {
    // Build department filter
    const deptCondition = departmentId ? 'AND dm.department_id = $3' : ''
    const params = departmentId ? [startDate, endDate, departmentId] : [startDate, endDate]

    // Get team members with their capacity
    const teamMembers = await queryRows(`
      SELECT
        tm.id,
        tm.name,
        tm.email,
        tm.role,
        tm.weekly_capacity,
        tm.target_utilization,
        tm.default_hourly_rate,
        d.id as department_id,
        d.name as department_name,
        COALESCE(booked.total_hours, 0) as booked_hours,
        COALESCE(logged.logged_hours, 0) as logged_hours
      FROM team_members tm
      LEFT JOIN department_members dm ON tm.id = dm.team_member_id AND dm.is_primary = true
      LEFT JOIN departments d ON dm.department_id = d.id
      LEFT JOIN (
        -- Hours booked on active project tasks
        SELECT
          t.assignee_id,
          SUM(t.estimated_hours) as total_hours
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE t.status NOT IN ('done', 'cancelled')
          AND p.status = 'active'
          AND t.due_date BETWEEN $1 AND $2
        GROUP BY t.assignee_id
      ) booked ON tm.id = booked.assignee_id
      LEFT JOIN (
        -- Hours already logged in period
        SELECT
          te.user_id,
          SUM(te.hours) as logged_hours
        FROM time_entries te
        WHERE te.date BETWEEN $1 AND $2
        GROUP BY te.user_id
      ) logged ON tm.id = logged.user_id
      WHERE tm.is_active = true ${deptCondition}
      ORDER BY tm.name
    `, params)

    // Calculate weeks in period
    const start = new Date(startDate as string)
    const end = new Date(endDate as string)
    const weeksInPeriod = Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))

    // Get project allocations
    const projectAllocations = await queryRows(`
      SELECT
        p.id as project_id,
        p.name as project_name,
        c.name as client_name,
        p.status,
        p.end_date,
        COUNT(DISTINCT t.assignee_id) as assigned_members,
        SUM(CASE WHEN t.status NOT IN ('done', 'cancelled') THEN t.estimated_hours ELSE 0 END) as remaining_hours,
        (
          SELECT json_agg(json_build_object(
            'userId', sub.assignee_id,
            'userName', sub.name,
            'hours', sub.hours
          ))
          FROM (
            SELECT
              t2.assignee_id,
              tm.name,
              SUM(t2.estimated_hours) as hours
            FROM tasks t2
            JOIN team_members tm ON t2.assignee_id = tm.id
            WHERE t2.project_id = p.id
              AND t2.status NOT IN ('done', 'cancelled')
              AND t2.due_date BETWEEN $1 AND $2
            GROUP BY t2.assignee_id, tm.name
          ) sub
        ) as team_allocation
      FROM projects p
      JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN tasks t ON p.id = t.project_id AND t.due_date BETWEEN $1 AND $2
      WHERE p.status = 'active'
      GROUP BY p.id, p.name, c.name, p.status, p.end_date
      HAVING SUM(CASE WHEN t.status NOT IN ('done', 'cancelled') THEN t.estimated_hours ELSE 0 END) > 0
      ORDER BY remaining_hours DESC
    `, [startDate, endDate])

    // Get weekly breakdown
    const weeklyBreakdown = await queryRows(`
      WITH weeks AS (
        SELECT
          generate_series(
            date_trunc('week', $1::date),
            date_trunc('week', $2::date),
            '1 week'::interval
          )::date as week_start
      )
      SELECT
        w.week_start,
        w.week_start + 6 as week_end,
        COALESCE(SUM(te.hours), 0) as logged_hours,
        COALESCE(SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END), 0) as billable_hours,
        COUNT(DISTINCT te.user_id) as active_users,
        COALESCE(task_hours.booked, 0) as booked_hours
      FROM weeks w
      LEFT JOIN time_entries te ON te.date >= w.week_start AND te.date < w.week_start + 7
      LEFT JOIN (
        SELECT
          date_trunc('week', t.due_date)::date as week_start,
          SUM(t.estimated_hours) as booked
        FROM tasks t
        WHERE t.status NOT IN ('done', 'cancelled')
          AND t.due_date BETWEEN $1 AND $2
        GROUP BY date_trunc('week', t.due_date)
      ) task_hours ON task_hours.week_start = w.week_start
      GROUP BY w.week_start, task_hours.booked
      ORDER BY w.week_start
    `, [startDate, endDate])

    // Calculate summary
    const totalCapacity = teamMembers.reduce((sum, m) => sum + (Number(m.weekly_capacity) || 40) * weeksInPeriod, 0)
    const totalBooked = teamMembers.reduce((sum, m) => sum + Number(m.booked_hours || 0), 0)
    const totalLogged = teamMembers.reduce((sum, m) => sum + Number(m.logged_hours || 0), 0)
    const avgUtilization = totalCapacity > 0 ? (totalBooked / totalCapacity) * 100 : 0

    // Identify overallocated and underutilized
    const overallocated = teamMembers.filter(m => {
      const capacity = (Number(m.weekly_capacity) || 40) * weeksInPeriod
      return Number(m.booked_hours || 0) > capacity * 1.1 // More than 110% allocated
    })

    const underutilized = teamMembers.filter(m => {
      const capacity = (Number(m.weekly_capacity) || 40) * weeksInPeriod
      const target = Number(m.target_utilization || 75) / 100
      return Number(m.booked_hours || 0) < capacity * target * 0.5 // Less than 50% of target
    })

    return {
      period: {
        startDate,
        endDate,
        weeksInPeriod
      },
      summary: {
        totalCapacity,
        totalBooked,
        totalLogged,
        availableHours: totalCapacity - totalBooked,
        utilizationPercent: avgUtilization,
        teamSize: teamMembers.length,
        overallocatedCount: overallocated.length,
        underutilizedCount: underutilized.length
      },
      teamMembers: teamMembers.map(m => {
        const weeklyCapacity = Number(m.weekly_capacity) || 40
        const periodCapacity = weeklyCapacity * weeksInPeriod
        const bookedHours = Number(m.booked_hours || 0)
        const loggedHours = Number(m.logged_hours || 0)
        const availableHours = Math.max(0, periodCapacity - bookedHours)
        const allocationPercent = periodCapacity > 0 ? (bookedHours / periodCapacity) * 100 : 0

        return {
          id: m.id,
          name: m.name,
          email: m.email,
          role: m.role,
          departmentId: m.department_id,
          departmentName: m.department_name,
          weeklyCapacity,
          periodCapacity,
          targetUtilization: Number(m.target_utilization || 75),
          hourlyRate: Number(m.default_hourly_rate || 0),
          bookedHours,
          loggedHours,
          availableHours,
          allocationPercent,
          status: allocationPercent > 110 ? 'overallocated' :
                  allocationPercent > 90 ? 'fully_booked' :
                  allocationPercent > 50 ? 'available' : 'underutilized'
        }
      }),
      projectAllocations: projectAllocations.map(p => ({
        projectId: p.project_id,
        projectName: p.project_name,
        clientName: p.client_name,
        status: p.status,
        endDate: p.end_date,
        assignedMembers: Number(p.assigned_members || 0),
        remainingHours: Number(p.remaining_hours || 0),
        teamAllocation: p.team_allocation || []
      })),
      weeklyBreakdown: weeklyBreakdown.map(w => ({
        weekStart: w.week_start,
        weekEnd: w.week_end,
        loggedHours: Number(w.logged_hours || 0),
        billableHours: Number(w.billable_hours || 0),
        bookedHours: Number(w.booked_hours || 0),
        activeUsers: Number(w.active_users || 0)
      })),
      alerts: {
        overallocated: overallocated.map(m => ({
          id: m.id,
          name: m.name,
          bookedHours: Number(m.booked_hours || 0),
          capacity: (Number(m.weekly_capacity) || 40) * weeksInPeriod
        })),
        underutilized: underutilized.map(m => ({
          id: m.id,
          name: m.name,
          bookedHours: Number(m.booked_hours || 0),
          capacity: (Number(m.weekly_capacity) || 40) * weeksInPeriod
        }))
      }
    }
  } catch (error) {
    console.error('Failed to fetch capacity data:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch capacity data'
    })
  }
})
