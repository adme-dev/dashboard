/**
 * Get Client Approvals
 * GET /api/agency/client-portal/approvals
 *
 * Query params:
 * - clientId: Filter by client
 * - projectId: Filter by project
 * - status: Filter by status
 * - limit: Max results
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const clientId = query.clientId as string | undefined
  const projectId = query.projectId as string | undefined
  const status = query.status as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    // Build query conditions
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (clientId) {
      conditions.push(`p.client_id = $${idx}`)
      params.push(clientId)
      idx++
    }

    if (projectId) {
      conditions.push(`ca.project_id = $${idx}`)
      params.push(projectId)
      idx++
    }

    if (status && status !== 'all') {
      conditions.push(`ca.status = $${idx}`)
      params.push(status)
      idx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
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
        c.id as client_id,
        c.name as client_name,
        t.id as task_id,
        t.title as task_title,
        requester.name as requested_by_name,
        responder.name as responded_by_name
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN tasks t ON ca.task_id = t.id
      LEFT JOIN team_members requester ON ca.requested_by = requester.id
      LEFT JOIN client_users responder ON ca.responded_by = responder.id
      ${whereClause}
      ORDER BY
        CASE ca.status WHEN 'pending' THEN 0 ELSE 1 END,
        ca.due_date ASC NULLS LAST,
        ca.requested_at DESC
      LIMIT $${idx}
    `, params)

    // Get summary
    const summaryConditions = clientId ? ['p.client_id = $1'] : []
    const summaryParams = clientId ? [clientId] : []
    const summaryWhere = summaryConditions.length > 0 ? `WHERE ${summaryConditions.join(' AND ')}` : ''

    const summary = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN ca.status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN ca.status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN ca.status = 'rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN ca.status = 'revision_requested' THEN 1 END) as revision_requested
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      ${summaryWhere}
    `, summaryParams)

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
        clientId: a.client_id,
        clientName: a.client_name,
        taskId: a.task_id,
        taskTitle: a.task_title,
        requestedByName: a.requested_by_name,
        respondedByName: a.responded_by_name
      })),
      summary: {
        total: Number(summary.total || 0),
        pending: Number(summary.pending || 0),
        approved: Number(summary.approved || 0),
        rejected: Number(summary.rejected || 0),
        revisionRequested: Number(summary.revision_requested || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch approvals:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch approvals'
    })
  }
})
