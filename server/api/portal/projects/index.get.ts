/**
 * Client Portal - List Projects
 * GET /api/portal/projects
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canViewProjects) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You do not have permission to view projects'
    })
  }

  const query = getQuery(event)
  const clientId = clientUser.clientId

  const status = query.status as string | undefined
  const view = query.view as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)
  const canApproveWork = clientUser.permissions.canApproveWork

  try {
    const conditions: string[] = ['p.client_id = $1']
    const params: unknown[] = [clientId]
    let idx = 2

    if (view === 'upcoming') {
      conditions.push(`p.status IN ('draft', 'active', 'on_hold')`)
      conditions.push(`(p.due_date IS NULL OR p.due_date >= CURRENT_DATE)`)
    } else if (view === 'history') {
      conditions.push(`p.status IN ('completed', 'cancelled')`)
    } else if (status && status !== 'all') {
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
        COALESCE(tasks.overdue, 0) as overdue_tasks,
        COALESCE(tasks.due_soon, 0) as due_soon_tasks,
        ${canApproveWork ? 'COALESCE(approvals.pending, 0)' : 'NULL'} as pending_approvals,
        COALESCE(deliverables.count, 0) as deliverable_count,
        pm.name as project_manager_name
      FROM projects p
      LEFT JOIN team_members pm ON p.project_manager_id = pm.id
      LEFT JOIN (
        SELECT
          t.project_id,
          COUNT(*) as total,
          COUNT(CASE WHEN t.status_is_final THEN 1 END) as completed,
          COUNT(CASE WHEN NOT t.status_is_final AND ts.name != 'Backlog' THEN 1 END) as in_progress,
          COUNT(CASE WHEN NOT t.status_is_final AND t.due_date < CURRENT_DATE THEN 1 END) as overdue,
          COUNT(CASE
            WHEN NOT t.status_is_final
              AND t.due_date >= CURRENT_DATE
              AND t.due_date <= CURRENT_DATE + INTERVAL '14 days'
            THEN 1
          END) as due_soon
        FROM tasks t
        JOIN task_statuses ts ON t.status_id = ts.id
        JOIN projects scoped_projects ON scoped_projects.id = t.project_id
        WHERE scoped_projects.client_id = $1
        GROUP BY t.project_id
      ) tasks ON p.id = tasks.project_id
      ${canApproveWork ? `LEFT JOIN (
        SELECT ca.project_id, COUNT(*) as pending
        FROM client_approvals ca
        JOIN projects scoped_projects ON scoped_projects.id = ca.project_id
        WHERE ca.status = 'pending'
          AND scoped_projects.client_id = $1
        GROUP BY ca.project_id
      ) approvals ON p.id = approvals.project_id` : ''}
      LEFT JOIN (
        SELECT project_id, COUNT(*) as count
        FROM client_deliverables
        WHERE is_visible_to_client = true
          AND client_id = $1
        GROUP BY project_id
      ) deliverables ON p.id = deliverables.project_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE
          WHEN $${idx + 1} = 'history' THEN NULL
          WHEN p.status = 'active' THEN 0
          WHEN p.status = 'on_hold' THEN 1
          WHEN p.status = 'draft' THEN 2
          ELSE 3
        END ASC NULLS LAST,
        CASE WHEN $${idx + 1} = 'history' THEN p.due_date END DESC NULLS LAST,
        CASE WHEN COALESCE($${idx + 1}, '') <> 'history' THEN p.due_date END ASC NULLS LAST,
        p.created_at DESC
      LIMIT $${idx}
    `, [...params, view || null])

    const summary = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'on_hold' THEN 1 END) as on_hold,
        COUNT(CASE
          WHEN status IN ('draft', 'active', 'on_hold')
            AND due_date < CURRENT_DATE
          THEN 1
        END) as overdue,
        COUNT(CASE
          WHEN status IN ('draft', 'active', 'on_hold')
            AND due_date >= CURRENT_DATE
            AND due_date <= CURRENT_DATE + INTERVAL '14 days'
          THEN 1
        END) as due_soon,
        MIN(CASE
          WHEN status IN ('draft', 'active', 'on_hold')
            AND due_date >= CURRENT_DATE
          THEN due_date
        END) as next_due_date,
        COUNT(CASE
          WHEN status = 'completed'
            AND COALESCE(updated_at, due_date, created_at) >= NOW() - INTERVAL '30 days'
          THEN 1
        END) as completed_last_30,
        COUNT(CASE
          WHEN status IN ('draft', 'active', 'on_hold')
            AND (due_date IS NULL OR due_date >= CURRENT_DATE)
          THEN 1
        END) as upcoming,
        COUNT(CASE WHEN status IN ('completed', 'cancelled') THEN 1 END) as history,
        COALESCE(SUM(budget), 0) as total_budget,
        COALESCE(SUM(CASE WHEN status IN ('draft', 'active', 'on_hold') THEN budget ELSE 0 END), 0) as booked_budget,
        (
          SELECT COUNT(*)
          FROM tasks t
          JOIN projects tp ON tp.id = t.project_id
          WHERE tp.client_id = $1
            AND t.status_is_final = false
        ) as open_tasks,
        (
          SELECT COUNT(*)
          FROM tasks t
          JOIN projects tp ON tp.id = t.project_id
          WHERE tp.client_id = $1
            AND t.status_is_final = false
            AND t.due_date < CURRENT_DATE
        ) as overdue_tasks,
        CASE WHEN $2::boolean THEN (
          SELECT COUNT(*)
          FROM client_approvals ca
          JOIN projects ap ON ap.id = ca.project_id
          WHERE ap.client_id = $1
            AND ca.status = 'pending'
        ) ELSE NULL END as pending_approvals,
        (
          SELECT COUNT(*)
          FROM client_deliverables cd
          WHERE cd.client_id = $1
            AND cd.is_visible_to_client = true
        ) as visible_deliverables
      FROM projects
      WHERE client_id = $1
    `, [clientId, canApproveWork])

    return {
      projects: projects.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        startDate: p.start_date,
        dueDate: p.due_date,
        budget: clientUser.permissions.canViewBudgets ? Number(p.budget || 0) : null,
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
        overdueTasks: Number(p.overdue_tasks || 0),
        dueSoonTasks: Number(p.due_soon_tasks || 0),
        pendingApprovals: canApproveWork ? Number(p.pending_approvals || 0) : null,
        deliverableCount: Number(p.deliverable_count || 0)
      })),
      summary: {
        total: Number(summary?.total || 0),
        active: Number(summary?.active || 0),
        completed: Number(summary?.completed || 0),
        onHold: Number(summary?.on_hold || 0),
        overdue: Number(summary?.overdue || 0),
        dueSoon: Number(summary?.due_soon || 0),
        nextDueDate: summary?.next_due_date || null,
        completedLast30: Number(summary?.completed_last_30 || 0),
        upcoming: Number(summary?.upcoming || 0),
        history: Number(summary?.history || 0),
        totalBudget: clientUser.permissions.canViewBudgets
          ? Number(summary?.total_budget || 0)
          : null,
        bookedBudget: clientUser.permissions.canViewBudgets
          ? Number(summary?.booked_budget || 0)
          : null,
        openTasks: Number(summary?.open_tasks || 0),
        overdueTasks: Number(summary?.overdue_tasks || 0),
        pendingApprovals: canApproveWork ? Number(summary?.pending_approvals || 0) : null,
        visibleDeliverables: Number(summary?.visible_deliverables || 0)
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
