/**
 * Client Portal - List Projects
 * GET /api/agency/client-portal/projects
 *
 * Query params:
 * - clientId: Client ID (required)
 * - status: Filter by status
 * - limit: Max results
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const clientId = query.clientId as string
  const status = query.status as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  try {
    const conditions: string[] = ['p.client_id = $1']
    const params: any[] = [clientId]
    let idx = 2

    if (status && status !== 'all') {
      conditions.push(`p.status = $${idx}`)
      params.push(status)
      idx++
    }

    params.push(limit)

    const projects = await queryRows(`
      SELECT
        p.id,
        p.name,
        p.description,
        p.status,
        p.start_date,
        p.due_date,
        p.budget,
        p.created_at,
        COALESCE(tasks.total, 0) as total_tasks,
        COALESCE(tasks.completed, 0) as completed_tasks,
        COALESCE(tasks.in_progress, 0) as in_progress_tasks,
        COALESCE(approvals.pending, 0) as pending_approvals,
        COALESCE(deliverables.count, 0) as deliverable_count,
        COALESCE(time.total_hours, 0) as total_hours,
        pm.name as project_manager_name
      FROM projects p
      LEFT JOIN team_members pm ON p.project_manager_id = pm.id
      LEFT JOIN (
        SELECT
          project_id,
          COUNT(*) as total,
          COUNT(CASE WHEN ts.is_final THEN 1 END) as completed,
          COUNT(CASE WHEN NOT ts.is_final AND ts.name != 'Backlog' THEN 1 END) as in_progress
        FROM tasks t
        JOIN task_statuses ts ON t.status_id = ts.id
        GROUP BY project_id
      ) tasks ON p.id = tasks.project_id
      LEFT JOIN (
        SELECT project_id, COUNT(*) as pending
        FROM client_approvals
        WHERE status = 'pending'
        GROUP BY project_id
      ) approvals ON p.id = approvals.project_id
      LEFT JOIN (
        SELECT project_id, COUNT(*) as count
        FROM client_deliverables
        WHERE is_visible_to_client = true
        GROUP BY project_id
      ) deliverables ON p.id = deliverables.project_id
      LEFT JOIN (
        SELECT project_id, SUM(hours) as total_hours
        FROM time_entries
        GROUP BY project_id
      ) time ON p.id = time.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE p.status WHEN 'active' THEN 0 WHEN 'on_hold' THEN 1 ELSE 2 END,
        p.due_date ASC NULLS LAST,
        p.created_at DESC
      LIMIT $${idx}
    `, params)

    // Get summary
    const summary = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'on_hold' THEN 1 END) as on_hold,
        COALESCE(SUM(budget), 0) as total_budget
      FROM projects
      WHERE client_id = $1
    `, [clientId])

    return {
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        startDate: p.start_date,
        dueDate: p.due_date,
        budget: Number(p.budget || 0),
        createdAt: p.created_at,
        projectManagerName: p.project_manager_name,
        tasks: {
          total: Number(p.total_tasks || 0),
          completed: Number(p.completed_tasks || 0),
          inProgress: Number(p.in_progress_tasks || 0),
          progressPercent: p.total_tasks > 0
            ? Math.round((Number(p.completed_tasks || 0) / Number(p.total_tasks)) * 100)
            : 0
        },
        pendingApprovals: Number(p.pending_approvals || 0),
        deliverableCount: Number(p.deliverable_count || 0),
        totalHours: Number(p.total_hours || 0)
      })),
      summary: {
        total: Number(summary?.total || 0),
        active: Number(summary?.active || 0),
        completed: Number(summary?.completed || 0),
        onHold: Number(summary?.on_hold || 0),
        totalBudget: Number(summary?.total_budget || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch projects:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch projects'
    })
  }
})
