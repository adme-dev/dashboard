/**
 * Client Portal - List Approvals
 * GET /api/portal/approvals
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const query = getQuery(event)

  const status = query.status as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    const conditions: string[] = ['p.client_id = $1']
    const params: unknown[] = [clientUser.clientId]
    let idx = 2

    if (status && status !== 'all') {
      conditions.push(`ca.status = $${idx}`)
      params.push(status)
      idx++
    }

    params.push(limit)

    const approvals = await queryRows(`
      SELECT
        ca.id,
        ca.approval_type,
        ca.title,
        ca.description,
        ca.attachments,
        ca.status,
        ca.requested_at,
        ca.due_date,
        ca.responded_at,
        ca.response_notes,
        ca.revision_number,
        p.id as project_id,
        p.name as project_name,
        t.id as task_id,
        t.title as task_title,
        requester.name as requested_by_name,
        responder.name as responded_by_name
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      LEFT JOIN tasks t ON ca.task_id = t.id
      LEFT JOIN team_members requester ON ca.requested_by = requester.id
      LEFT JOIN client_users responder ON ca.responded_by = responder.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE ca.status WHEN 'pending' THEN 0 ELSE 1 END,
        ca.due_date ASC NULLS LAST,
        ca.requested_at DESC
      LIMIT $${idx}
    `, params)

    const summary = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN ca.status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN ca.status = 'pending' AND ca.due_date < CURRENT_DATE THEN 1 END) as overdue,
        COUNT(CASE WHEN ca.status = 'pending' AND ca.due_date >= CURRENT_DATE AND ca.due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 1 END) as due_soon,
        COUNT(CASE WHEN ca.status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN ca.status = 'rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN ca.status = 'revision_requested' THEN 1 END) as revision_requested
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      WHERE p.client_id = $1
    `, [clientUser.clientId])

    return {
      approvals: approvals.map(a => ({
        id: a.id,
        approvalType: a.approval_type,
        title: a.title,
        description: a.description,
        attachments: a.attachments,
        status: a.status,
        requestedAt: a.requested_at,
        dueDate: a.due_date,
        respondedAt: a.responded_at,
        responseNotes: a.response_notes,
        revisionNumber: a.revision_number,
        projectId: a.project_id,
        projectName: a.project_name,
        taskId: a.task_id,
        taskTitle: a.task_title,
        requestedByName: a.requested_by_name,
        respondedByName: a.responded_by_name
      })),
      summary: {
        total: Number(summary?.total || 0),
        pending: Number(summary?.pending || 0),
        overdue: Number(summary?.overdue || 0),
        dueSoon: Number(summary?.due_soon || 0),
        approved: Number(summary?.approved || 0),
        rejected: Number(summary?.rejected || 0),
        revisionRequested: Number(summary?.revision_requested || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch approvals:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch approvals' })
  }
})
