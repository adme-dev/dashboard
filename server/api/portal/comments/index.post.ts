/**
 * Client Portal - Add Comment
 * POST /api/portal/comments
 */

import { queryOneFresh } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (!clientUser.permissions.canAddComments) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to add comments' })
  }

  const body = await readBody(event)
  const { content, projectId, approvalId, parentCommentId } = body

  if (!content?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Comment content is required' })
  }

  if (Boolean(projectId) === Boolean(approvalId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Exactly one comment scope is required'
    })
  }

  if (projectId && !clientUser.permissions.canViewProjects) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to view projects' })
  }

  if (approvalId && !clientUser.permissions.canApproveWork) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to view approvals' })
  }

  try {
    // Verify the entity belongs to this client
    if (projectId) {
      const project = await queryOneFresh(`
        SELECT p.id
        FROM projects p
        LEFT JOIN client_project_settings cps ON cps.project_id = p.id
        WHERE p.id = $1
          AND p.client_id = $2
          AND COALESCE(cps.show_comments, true) = true
      `, [projectId, clientUser.clientId])
      if (!project) {
        throw createError({ statusCode: 404, statusMessage: 'Project not found' })
      }
    }

    if (approvalId) {
      const approval = await queryOneFresh(`
        SELECT ca.id FROM client_approvals ca
        JOIN projects p ON ca.project_id = p.id
        LEFT JOIN client_project_settings cps ON cps.project_id = p.id
        WHERE ca.id = $1
          AND p.client_id = $2
          AND COALESCE(cps.show_comments, true) = true
      `, [approvalId, clientUser.clientId])
      if (!approval) {
        throw createError({ statusCode: 404, statusMessage: 'Approval not found' })
      }
    }

    if (parentCommentId) {
      const parent = await queryOneFresh(`
        SELECT id AS parent_comment_id
        FROM client_comments
        WHERE id = $1
          AND is_internal = false
          AND (
            ($2 IS NOT NULL AND project_id = $2 AND approval_id IS NULL)
            OR
            ($3 IS NOT NULL AND approval_id = $3 AND project_id IS NULL)
          )
      `, [parentCommentId, projectId || null, approvalId || null])

      if (!parent) {
        throw createError({ statusCode: 404, statusMessage: 'Parent comment not found' })
      }
    }

    const comment = await queryOneFresh(`
      INSERT INTO client_comments (
        client_user_id, project_id, approval_id, parent_comment_id,
        content, is_internal
      ) VALUES ($1, $2, $3, $4, $5, false)
      RETURNING id, content, created_at
    `, [clientUser.id, projectId || null, approvalId || null, parentCommentId || null, content.trim()])

    return {
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.created_at,
        author: {
          type: 'client',
          id: clientUser.id,
          name: clientUser.name,
          avatarUrl: clientUser.avatarUrl
        }
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to add comment:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to add comment' })
  }
})
