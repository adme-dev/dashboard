/**
 * Get Single Approval
 * GET /api/agency/client-portal/approvals/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const approvalId = getRouterParam(event, 'id')

  if (!approvalId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Approval ID is required'
    })
  }

  try {
    const approval = await queryOne(`
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
        ca.previous_approval_id,
        p.id as project_id,
        p.name as project_name,
        c.id as client_id,
        c.name as client_name,
        t.id as task_id,
        t.title as task_title,
        i.id as invoice_id,
        i.invoice_number,
        requester.id as requested_by_id,
        requester.name as requested_by_name,
        responder.id as responded_by_id,
        responder.name as responded_by_name
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN tasks t ON ca.task_id = t.id
      LEFT JOIN invoices i ON ca.invoice_id = i.id
      LEFT JOIN team_members requester ON ca.requested_by = requester.id
      LEFT JOIN client_users responder ON ca.responded_by = responder.id
      WHERE ca.id = $1
    `, [approvalId])

    if (!approval) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Approval not found'
      })
    }

    // Get comments on this approval
    const comments = await queryRows(`
      SELECT
        cc.id,
        cc.content,
        cc.attachments,
        cc.is_internal,
        cc.created_at,
        cu.id as client_user_id,
        cu.name as client_user_name,
        tm.id as team_member_id,
        tm.name as team_member_name
      FROM client_comments cc
      LEFT JOIN client_users cu ON cc.client_user_id = cu.id
      LEFT JOIN team_members tm ON cc.team_member_id = tm.id
      WHERE cc.approval_id = $1
        AND cc.is_internal = false
      ORDER BY cc.created_at ASC
    `, [approvalId])

    // Get revision history if any
    let revisionHistory: any[] = []
    if (approval.revision_number > 1) {
      revisionHistory = await queryRows(`
        WITH RECURSIVE revisions AS (
          SELECT id, title, status, responded_at, response_notes, revision_number, previous_approval_id
          FROM client_approvals
          WHERE id = $1
          UNION ALL
          SELECT ca.id, ca.title, ca.status, ca.responded_at, ca.response_notes, ca.revision_number, ca.previous_approval_id
          FROM client_approvals ca
          JOIN revisions r ON ca.id = r.previous_approval_id
        )
        SELECT * FROM revisions ORDER BY revision_number ASC
      `, [approvalId])
    }

    return {
      approval: {
        id: approval.id,
        approvalType: approval.approval_type,
        title: approval.title,
        description: approval.description,
        attachments: approval.attachments,
        status: approval.status,
        requestedAt: approval.requested_at,
        dueDate: approval.due_date,
        respondedAt: approval.responded_at,
        responseNotes: approval.response_notes,
        revisionNumber: approval.revision_number,
        project: {
          id: approval.project_id,
          name: approval.project_name
        },
        client: {
          id: approval.client_id,
          name: approval.client_name
        },
        task: approval.task_id ? {
          id: approval.task_id,
          title: approval.task_title
        } : null,
        invoice: approval.invoice_id ? {
          id: approval.invoice_id,
          number: approval.invoice_number
        } : null,
        requestedBy: {
          id: approval.requested_by_id,
          name: approval.requested_by_name
        },
        respondedBy: approval.responded_by_id ? {
          id: approval.responded_by_id,
          name: approval.responded_by_name
        } : null
      },
      comments: comments.map(c => ({
        id: c.id,
        content: c.content,
        attachments: c.attachments,
        createdAt: c.created_at,
        author: c.client_user_id ? {
          type: 'client',
          id: c.client_user_id,
          name: c.client_user_name
        } : {
          type: 'team',
          id: c.team_member_id,
          name: c.team_member_name
        }
      })),
      revisionHistory: revisionHistory.map(r => ({
        id: r.id,
        revisionNumber: r.revision_number,
        status: r.status,
        respondedAt: r.responded_at,
        responseNotes: r.response_notes
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch approval:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch approval'
    })
  }
})
