/**
 * Client Portal - Add Comment
 * POST /api/portal/comments
 */

import { queryOne, execute } from '~~/server/utils/db'
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

  if (!projectId && !approvalId) {
    throw createError({ statusCode: 400, statusMessage: 'Either projectId or approvalId is required' })
  }

  try {
    // Verify the entity belongs to this client
    if (projectId) {
      const project = await queryOne(`
        SELECT id FROM projects WHERE id = $1 AND client_id = $2
      `, [projectId, clientUser.clientId])
      if (!project) {
        throw createError({ statusCode: 404, statusMessage: 'Project not found' })
      }
    }

    if (approvalId) {
      const approval = await queryOne(`
        SELECT ca.id FROM client_approvals ca
        JOIN projects p ON ca.project_id = p.id
        WHERE ca.id = $1 AND p.client_id = $2
      `, [approvalId, clientUser.clientId])
      if (!approval) {
        throw createError({ statusCode: 404, statusMessage: 'Approval not found' })
      }
    }

    const comment = await queryOne(`
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
