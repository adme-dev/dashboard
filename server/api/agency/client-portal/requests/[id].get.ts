/**
 * Agency - Request Detail (staff view)
 * GET /api/agency/client-portal/requests/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const requestId = getRouterParam(event, 'id')

  if (!requestId) {
    throw createError({ statusCode: 400, statusMessage: 'Request ID is required' })
  }

  try {
    const request = await queryOne(`
      SELECT
        cr.*,
        c.name as client_name,
        p.name as project_name,
        tm.name as assigned_name,
        tm.avatar_url as assigned_avatar,
        tm.role as assigned_role,
        resp.name as responded_by_name,
        cu.name as submitted_by_name,
        cu.email as submitted_by_email
      FROM client_requests cr
      JOIN agency_clients c ON cr.client_id = c.id
      LEFT JOIN projects p ON cr.project_id = p.id
      LEFT JOIN team_members tm ON cr.assigned_to = tm.id
      LEFT JOIN team_members resp ON cr.responded_by = resp.id
      LEFT JOIN client_users cu ON cr.client_user_id = cu.id
      WHERE cr.id = $1
    `, [requestId])

    if (!request) {
      throw createError({ statusCode: 404, statusMessage: 'Request not found' })
    }

    // Staff sees ALL messages including internal notes
    const messages = await queryRows(`
      SELECT
        m.id,
        m.content,
        m.attachments,
        m.is_internal,
        m.created_at,
        cu.name as client_user_name,
        cu.avatar_url as client_user_avatar,
        tm.name as team_member_name,
        tm.avatar_url as team_member_avatar
      FROM client_request_messages m
      LEFT JOIN client_users cu ON m.client_user_id = cu.id
      LEFT JOIN team_members tm ON m.team_member_id = tm.id
      WHERE m.request_id = $1
      ORDER BY m.created_at ASC
    `, [requestId])

    return {
      request: {
        id: request.id,
        clientId: request.client_id,
        clientName: request.client_name,
        clientUserId: request.client_user_id,
        requestType: request.request_type,
        category: request.category,
        title: request.title,
        description: request.description,
        priority: request.priority,
        status: request.status,
        assignedTo: request.assigned_to,
        assignedName: request.assigned_name,
        assignedAvatar: request.assigned_avatar,
        assignedRole: request.assigned_role,
        projectId: request.project_id,
        projectName: request.project_name,
        taskId: request.task_id,
        attachments: request.attachments,
        estimatedBudget: request.estimated_budget ? Number(request.estimated_budget) : null,
        desiredDeadline: request.desired_deadline,
        responseNotes: request.response_notes,
        respondedByName: request.responded_by_name,
        respondedAt: request.responded_at,
        resolvedAt: request.resolved_at,
        submittedByName: request.submitted_by_name,
        submittedByEmail: request.submitted_by_email,
        createdAt: request.created_at,
        updatedAt: request.updated_at
      },
      messages: messages.map(m => ({
        id: m.id,
        content: m.content,
        attachments: m.attachments,
        isInternal: m.is_internal,
        authorName: m.client_user_name || m.team_member_name,
        authorAvatar: m.client_user_avatar || m.team_member_avatar,
        authorType: m.client_user_name ? 'client' : 'team',
        createdAt: m.created_at
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch request:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch request' })
  }
})
