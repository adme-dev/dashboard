/**
 * Milestones Report
 * GET /api/agency/reports/milestones
 *
 * Returns milestone tasks with status and timeline metrics
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface Milestone {
  id: string
  title: string
  projectId: string
  projectName: string
  clientName: string | null
  dueDate: string | null
  completedAt: string | null
  status: 'upcoming' | 'on_track' | 'at_risk' | 'overdue' | 'completed'
  isCompleted: boolean
  daysUntilDue: number | null
  daysOverdue: number | null
  assigneeName: string | null
  dependentTasksCount: number
  dependentTasksCompleted: number
  blockers: string[]
}

interface MilestonesResponse {
  milestones: Milestone[]
  summary: {
    total: number
    upcoming: number
    completed: number
    overdue: number
    onTimeRate: number
  }
  timeline: Array<{
    month: string
    planned: number
    completed: number
    overdue: number
  }>
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const projectId = query.projectId as string | undefined
  const departmentId = query.departmentId as string | undefined
  const status = query.status as string | undefined
  const dateFrom = query.dateFrom as string | undefined
  const dateTo = query.dateTo as string | undefined

  try {
    // Build conditions
    const conditions: string[] = [`t.task_type = 'milestone'`]
    const params: string[] = []
    let paramIdx = 1

    if (projectId) {
      conditions.push(`t.project_id = $${paramIdx}`)
      params.push(projectId)
      paramIdx++
    }

    if (departmentId) {
      conditions.push(`t.department_id = $${paramIdx}`)
      params.push(departmentId)
      paramIdx++
    }

    if (dateFrom) {
      conditions.push(`t.due_date >= $${paramIdx}::date`)
      params.push(dateFrom)
      paramIdx++
    }

    if (dateTo) {
      conditions.push(`t.due_date <= $${paramIdx}::date`)
      params.push(dateTo)
      paramIdx++
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`

    // Get milestones
    const milestonesQuery = `
      SELECT
        t.id,
        t.title,
        t.project_id,
        p.name AS project_name,
        c.name AS client_name,
        t.due_date,
        t.updated_at AS completed_at,
        t.status_is_final AS is_completed,
        ts.name AS status_name,
        tm.name AS assignee_name,
        (
          SELECT COUNT(*)
          FROM task_dependencies td
          WHERE td.depends_on_task_id = t.id
        ) AS dependent_tasks_count,
        (
          SELECT COUNT(*)
          FROM task_dependencies td
          JOIN tasks dt ON td.task_id = dt.id
          JOIN task_statuses dts ON dt.status_id = dts.id
          WHERE td.depends_on_task_id = t.id AND dt.status_is_final = true
        ) AS dependent_tasks_completed
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      LEFT JOIN team_members tm ON t.assignee_id = tm.id
      ${whereClause}
      ORDER BY
        CASE WHEN t.status_is_final = true THEN 1 ELSE 0 END,
        t.due_date NULLS LAST
    `

    const milestonesResult = await queryRows(milestonesQuery, params)

    // Get blockers for each milestone
    const blockersQuery = `
      SELECT
        t.id AS milestone_id,
        bt.title AS blocker_title
      FROM tasks t
      JOIN task_dependencies td ON td.depends_on_task_id = t.id
      JOIN tasks bt ON td.task_id = bt.id
      JOIN task_statuses bts ON bt.status_id = bts.id
      ${whereClause}
      AND bt.status_is_final = false
      AND bt.is_blocked = true
    `

    const blockersResult = await queryRows(blockersQuery, params)

    // Build blockers map
    const blockersMap = new Map<string, string[]>()
    for (const row of blockersResult) {
      if (!blockersMap.has(row.milestone_id)) {
        blockersMap.set(row.milestone_id, [])
      }
      blockersMap.get(row.milestone_id)!.push(row.blocker_title)
    }

    const today = new Date()
    const milestones: Milestone[] = milestonesResult.map(row => {
      const dueDate = row.due_date ? new Date(row.due_date) : null
      const isCompleted = row.is_completed
      const completedAt = isCompleted ? row.completed_at : null

      let daysUntilDue: number | null = null
      let daysOverdue: number | null = null
      let milestoneStatus: Milestone['status']

      if (isCompleted) {
        milestoneStatus = 'completed'
      } else if (!dueDate) {
        milestoneStatus = 'upcoming'
      } else {
        const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        if (diffDays < 0) {
          daysOverdue = Math.abs(diffDays)
          milestoneStatus = 'overdue'
        } else if (diffDays <= 7) {
          daysUntilDue = diffDays
          milestoneStatus = 'at_risk'
        } else {
          daysUntilDue = diffDays
          milestoneStatus = 'on_track'
        }
      }

      // Apply status filter if provided
      if (status && milestoneStatus !== status) {
        return null
      }

      return {
        id: row.id,
        title: row.title,
        projectId: row.project_id,
        projectName: row.project_name,
        clientName: row.client_name,
        dueDate: row.due_date,
        completedAt,
        status: milestoneStatus,
        isCompleted,
        daysUntilDue,
        daysOverdue,
        assigneeName: row.assignee_name,
        dependentTasksCount: Number(row.dependent_tasks_count) || 0,
        dependentTasksCompleted: Number(row.dependent_tasks_completed) || 0,
        blockers: blockersMap.get(row.id) || []
      }
    }).filter((m): m is Milestone => m !== null)

    // Calculate summary
    const completed = milestones.filter(m => m.isCompleted).length
    const overdue = milestones.filter(m => m.status === 'overdue').length
    const upcoming = milestones.filter(m => ['upcoming', 'on_track', 'at_risk'].includes(m.status)).length

    // Calculate on-time rate from completed milestones
    const completedMilestones = milestones.filter(m => m.isCompleted)
    let onTimeCount = 0
    for (const m of completedMilestones) {
      if (m.dueDate && m.completedAt) {
        const due = new Date(m.dueDate)
        const done = new Date(m.completedAt)
        if (done <= due) onTimeCount++
      }
    }
    const onTimeRate = completedMilestones.length > 0
      ? Math.round((onTimeCount / completedMilestones.length) * 100)
      : 100

    // Get timeline data
    const timelineQuery = `
      SELECT
        DATE_TRUNC('month', t.due_date)::date AS month,
        COUNT(*) AS planned,
        COUNT(*) FILTER (WHERE t.status_is_final = true) AS completed,
        COUNT(*) FILTER (
          WHERE t.status_is_final = false
          AND t.due_date < CURRENT_DATE
        ) AS overdue
      FROM tasks t
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.task_type = 'milestone'
        AND t.due_date IS NOT NULL
        AND t.due_date >= CURRENT_DATE - INTERVAL '6 months'
        AND t.due_date <= CURRENT_DATE + INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', t.due_date)
      ORDER BY month
    `

    const timelineResult = await queryRows(timelineQuery, [])

    const timeline = timelineResult.map(row => ({
      month: row.month,
      planned: Number(row.planned) || 0,
      completed: Number(row.completed) || 0,
      overdue: Number(row.overdue) || 0
    }))

    const response: MilestonesResponse = {
      milestones,
      summary: {
        total: milestones.length,
        upcoming,
        completed,
        overdue,
        onTimeRate
      },
      timeline
    }

    return response
  } catch (error) {
    console.error('Failed to generate milestones report:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate milestones report'
    })
  }
})
