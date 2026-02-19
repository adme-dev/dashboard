/**
 * Get Approval by Token (Public)
 * GET /api/approve/:token
 *
 * Returns approval details for the given token
 * NO AUTHENTICATION REQUIRED - token serves as proof of access
 */

import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')

  if (!token || token.length !== 64) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid approval token'
    })
  }

  try {
    // Find approval by token
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
        ca.token_expires_at,
        p.id as project_id,
        p.name as project_name,
        c.id as client_id,
        c.name as client_name,
        t.id as task_id,
        t.title as task_title,
        requester.name as requested_by_name
      FROM client_approvals ca
      JOIN projects p ON ca.project_id = p.id
      JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN tasks t ON ca.task_id = t.id
      LEFT JOIN team_members requester ON ca.requested_by = requester.id
      WHERE ca.approval_token = $1
    `, [token])

    if (!approval) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Approval not found or token is invalid'
      })
    }

    // Check token expiration
    if (approval.token_expires_at && new Date(approval.token_expires_at) < new Date()) {
      throw createError({
        statusCode: 410,
        statusMessage: 'This approval link has expired. Please request a new link from your contact.'
      })
    }

    // Get comments on this approval (non-internal only)
    const comments = await queryRows(`
      SELECT
        cc.id,
        cc.content,
        cc.attachments,
        cc.created_at,
        cu.name as client_user_name,
        tm.name as team_member_name
      FROM client_comments cc
      LEFT JOIN client_users cu ON cc.client_user_id = cu.id
      LEFT JOIN team_members tm ON cc.team_member_id = tm.id
      WHERE cc.approval_id = $1
        AND cc.is_internal = false
      ORDER BY cc.created_at ASC
    `, [approval.id])

    // Parse attachments
    let attachments = []
    try {
      attachments = typeof approval.attachments === 'string'
        ? JSON.parse(approval.attachments)
        : (approval.attachments || [])
    } catch {
      attachments = []
    }

    return {
      approval: {
        id: approval.id,
        approvalType: approval.approval_type,
        title: approval.title,
        description: approval.description,
        attachments,
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
        requestedBy: approval.requested_by_name
      },
      comments: comments.map(c => ({
        id: c.id,
        content: c.content,
        attachments: c.attachments,
        createdAt: c.created_at,
        author: c.client_user_name || c.team_member_name || 'Unknown'
      })),
      canRespond: approval.status === 'pending',
      tokenExpiresAt: approval.token_expires_at
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch approval by token:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch approval'
    })
  }
})
