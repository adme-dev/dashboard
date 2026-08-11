/**
 * Workload Report
 * GET /api/agency/reports/workload
 *
 * Returns team workload metrics including utilization and allocation
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface MemberWorkload {
  memberId: string
  memberName: string
  memberAvatar: string | null
  departmentId: string | null
  departmentName: string | null
  role: string | null
  activeTasks: number
  completedTasks: number
  estimatedHours: number
  actualHours: number
  utilizationPercent: number
  overdueCount: number
  status: 'underutilized' | 'optimal' | 'overloaded'
}

interface ProjectAllocation {
  projectId: string
  projectName: string
  clientName: string | null
  allocatedHours: number
  trackedHours: number
  taskCount: number
}

interface WorkloadResponse {
  members: MemberWorkload[]
  summary: {
    totalMembers: number
    overloaded: number
    optimal: number
    underutilized: number
    averageUtilization: number
    totalEstimatedHours: number
    totalActualHours: number
  }
  byProject: ProjectAllocation[]
  byDepartment: Array<{
    departmentId: string
    departmentName: string
    memberCount: number
    averageUtilization: number
    totalTasks: number
  }>
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const departmentId = query.departmentId as string | undefined
  const projectId = query.projectId as string | undefined
  const includeInactive = query.includeInactive === 'true'

  try {
    // Build conditions for team members
    const memberConditions: string[] = []
    const params: string[] = []
    let paramIdx = 1

    if (!includeInactive) {
      memberConditions.push('tm.is_active = true')
    }

    if (departmentId) {
      memberConditions.push(`tm.department_id = $${paramIdx}`)
      params.push(departmentId)
      paramIdx++
    }

    const memberWhereClause = memberConditions.length > 0
      ? `WHERE ${memberConditions.join(' AND ')}`
      : ''

    // Get member workload data
    const membersQuery = `
      SELECT
        tm.id AS member_id,
        tm.name AS member_name,
        tm.avatar_url AS member_avatar,
        tm.department_id,
        d.name AS department_name,
        tm.role,
        COUNT(t.id) FILTER (WHERE t.status_is_final = false) AS active_tasks,
        COUNT(t.id) FILTER (WHERE t.status_is_final = true) AS completed_tasks,
        COALESCE(SUM(t.estimated_hours) FILTER (WHERE t.status_is_final = false), 0) AS estimated_hours,
        COALESCE(SUM(t.actual_hours), 0) AS actual_hours,
        COUNT(t.id) FILTER (
          WHERE t.status_is_final = false
          AND t.due_date < CURRENT_DATE
        ) AS overdue_count
      FROM team_members tm
      LEFT JOIN departments d ON tm.department_id = d.id
      LEFT JOIN tasks t ON t.assignee_id = tm.id
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      ${memberWhereClause}
      GROUP BY tm.id, tm.name, tm.avatar_url, tm.department_id, d.name, tm.role
      ORDER BY active_tasks DESC
    `

    const membersResult = await queryRows(membersQuery, params)

    // Calculate workload status for each member
    // Assuming 40 hours/week capacity, 8 hours/day
    const weeklyCapacity = 40
    const members: MemberWorkload[] = membersResult.map((row) => {
      const estimatedHours = Number(row.estimated_hours) || 0
      const utilizationPercent = Math.round((estimatedHours / weeklyCapacity) * 100)

      let status: 'underutilized' | 'optimal' | 'overloaded'
      if (utilizationPercent < 50) {
        status = 'underutilized'
      } else if (utilizationPercent <= 100) {
        status = 'optimal'
      } else {
        status = 'overloaded'
      }

      return {
        memberId: row.member_id,
        memberName: row.member_name,
        memberAvatar: row.member_avatar,
        departmentId: row.department_id,
        departmentName: row.department_name,
        role: row.role,
        activeTasks: Number(row.active_tasks) || 0,
        completedTasks: Number(row.completed_tasks) || 0,
        estimatedHours,
        actualHours: Number(row.actual_hours) || 0,
        utilizationPercent,
        overdueCount: Number(row.overdue_count) || 0,
        status
      }
    })

    // Calculate summary
    const overloaded = members.filter(m => m.status === 'overloaded').length
    const optimal = members.filter(m => m.status === 'optimal').length
    const underutilized = members.filter(m => m.status === 'underutilized').length
    const totalEstimatedHours = members.reduce((sum, m) => sum + m.estimatedHours, 0)
    const totalActualHours = members.reduce((sum, m) => sum + m.actualHours, 0)
    const averageUtilization = members.length > 0
      ? Math.round(members.reduce((sum, m) => sum + m.utilizationPercent, 0) / members.length)
      : 0

    // Get allocation by project
    const projectConditions: string[] = []
    const projectParams: string[] = []
    let projectParamIdx = 1

    if (projectId) {
      projectConditions.push(`p.id = $${projectParamIdx}`)
      projectParams.push(projectId)
      projectParamIdx++
    }

    const projectWhereClause = projectConditions.length > 0
      ? `WHERE ${projectConditions.join(' AND ')}`
      : ''

    const projectsQuery = `
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        c.name AS client_name,
        COALESCE(SUM(t.estimated_hours), 0) AS allocated_hours,
        COALESCE(SUM(t.actual_hours), 0) AS tracked_hours,
        COUNT(t.id) AS task_count
      FROM projects p
      LEFT JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN tasks t ON t.project_id = p.id
      ${projectWhereClause}
      GROUP BY p.id, p.name, c.name
      HAVING COUNT(t.id) > 0
      ORDER BY allocated_hours DESC
      LIMIT 20
    `

    const projectsResult = await queryRows(projectsQuery, projectParams)

    const byProject: ProjectAllocation[] = projectsResult.map(row => ({
      projectId: row.project_id,
      projectName: row.project_name,
      clientName: row.client_name,
      allocatedHours: Number(row.allocated_hours) || 0,
      trackedHours: Number(row.tracked_hours) || 0,
      taskCount: Number(row.task_count) || 0
    }))

    // Get workload by department
    const byDepartmentQuery = `
      SELECT
        d.id AS department_id,
        d.name AS department_name,
        COUNT(DISTINCT tm.id) AS member_count,
        COALESCE(
          ROUND(
            AVG(
              COALESCE(
                (
                  SELECT SUM(t2.estimated_hours)
                  FROM tasks t2
                  JOIN task_statuses ts2 ON t2.status_id = ts2.id
                  WHERE t2.assignee_id = tm.id AND t2.status_is_final = false
                ), 0
              ) / 40.0 * 100
            )::numeric, 0
          ), 0
        ) AS avg_utilization,
        COUNT(DISTINCT t.id) AS total_tasks
      FROM departments d
      LEFT JOIN team_members tm ON tm.department_id = d.id AND tm.is_active = true
      LEFT JOIN tasks t ON t.department_id = d.id
      GROUP BY d.id, d.name
      ORDER BY total_tasks DESC
    `

    const byDepartmentResult = await queryRows(byDepartmentQuery, [])

    const byDepartment = byDepartmentResult.map(row => ({
      departmentId: row.department_id,
      departmentName: row.department_name,
      memberCount: Number(row.member_count) || 0,
      averageUtilization: Number(row.avg_utilization) || 0,
      totalTasks: Number(row.total_tasks) || 0
    }))

    const response: WorkloadResponse = {
      members,
      summary: {
        totalMembers: members.length,
        overloaded,
        optimal,
        underutilized,
        averageUtilization,
        totalEstimatedHours,
        totalActualHours
      },
      byProject,
      byDepartment
    }

    return response
  } catch (error) {
    console.error('Failed to generate workload report:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate workload report'
    })
  }
})
