/**
 * Create Client Comment
 * POST /api/agency/client-portal/comments
 *
 * Body:
 * - content: Comment text (required)
 * - projectId: Project context
 * - taskId: Task context
 * - approvalId: Approval context
 * - invoiceId: Invoice context
 * - parentCommentId: For threading/replies
 * - attachments: Array of {name, url, type}
 * - isInternal: Boolean (team notes, hidden from client)
 * - clientUserId: If posted on behalf of client (for agency)
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CreateCommentBody {
  content: string
  projectId?: string
  taskId?: string
  approvalId?: string
  invoiceId?: string
  parentCommentId?: string
  attachments?: Array<{ name: string; url: string; type: string }>
  isInternal?: boolean
  clientUserId?: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateCommentBody>(event)

  const { content, projectId, taskId, approvalId, invoiceId } = body

  if (!content?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Comment content is required'
    })
  }

  // Must have at least one context
  if (!projectId && !taskId && !approvalId && !invoiceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Comment must be associated with a project, task, approval, or invoice'
    })
  }

  try {
    // Verify parent comment if provided
    if (body.parentCommentId) {
      const parent = await queryOne(`
        SELECT id FROM client_comments WHERE id = $1
      `, [body.parentCommentId])

      if (!parent) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Parent comment not found'
        })
      }
    }

    // Determine if this is from a client user or team member
    const clientUserId = body.clientUserId || null
    const teamMemberId = clientUserId ? null : user.id

    const comment = await queryOne(`
      INSERT INTO client_comments (
        project_id,
        task_id,
        approval_id,
        invoice_id,
        client_user_id,
        team_member_id,
        content,
        attachments,
        parent_comment_id,
        is_internal
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      projectId || null,
      taskId || null,
      approvalId || null,
      invoiceId || null,
      clientUserId,
      teamMemberId,
      content.trim(),
      JSON.stringify(body.attachments || []),
      body.parentCommentId || null,
      body.isInternal ?? false
    ])

    // Log activity if this is on an approval
    if (approvalId) {
      const approval = await queryOne(`
        SELECT project_id FROM client_approvals WHERE id = $1
      `, [approvalId])

      if (approval) {
        await queryOne(`
          SELECT p.client_id FROM projects p WHERE p.id = $1
        `, [approval.project_id]).then(async (project) => {
          if (project) {
            await queryOne(`
              INSERT INTO client_activity_log (client_user_id, client_id, action, entity_type, entity_id, details)
              VALUES ($1, $2, 'comment_added', 'approval', $3, $4)
            `, [
              clientUserId,
              project.client_id,
              approvalId,
              JSON.stringify({ commentId: comment.id, isInternal: body.isInternal })
            ])
          }
        })
      }
    }

    return {
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        attachments: comment.attachments,
        isInternal: comment.is_internal,
        isResolved: comment.is_resolved,
        parentCommentId: comment.parent_comment_id,
        createdAt: comment.created_at,
        author: clientUserId ? {
          type: 'client',
          id: clientUserId
        } : {
          type: 'team',
          id: teamMemberId
        }
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create comment'
    })
  }
})
