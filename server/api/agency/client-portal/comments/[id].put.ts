/**
 * Update Client Comment
 * PUT /api/agency/client-portal/comments/:id
 *
 * Body:
 * - content: Updated comment text
 * - attachments: Updated attachments
 * - isResolved: Mark as resolved
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateCommentBody {
  content?: string
  attachments?: Array<{ name: string; url: string; type: string }>
  isResolved?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const commentId = getRouterParam(event, 'id')
  const body = await readBody<UpdateCommentBody>(event)

  if (!commentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Comment ID is required'
    })
  }

  try {
    // Check comment exists and user has permission
    const existing = await queryOne(`
      SELECT id, team_member_id, client_user_id, is_internal
      FROM client_comments WHERE id = $1
    `, [commentId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Comment not found'
      })
    }

    // Only the author or an admin can edit the comment
    // Team members can edit their own comments
    if (existing.team_member_id && existing.team_member_id !== user.id) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You can only edit your own comments'
      })
    }

    // Build dynamic update
    const fields: string[] = []
    const values: any[] = []
    let idx = 1

    if (body.content !== undefined) {
      if (!body.content.trim()) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Comment content cannot be empty'
        })
      }
      fields.push(`content = $${idx}`)
      values.push(body.content.trim())
      idx++
    }

    if (body.attachments !== undefined) {
      fields.push(`attachments = $${idx}`)
      values.push(JSON.stringify(body.attachments))
      idx++
    }

    if (body.isResolved !== undefined) {
      fields.push(`is_resolved = $${idx}`)
      values.push(body.isResolved)
      idx++
    }

    if (fields.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No fields to update'
      })
    }

    values.push(commentId)

    const comment = await queryOne(`
      UPDATE client_comments
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING *
    `, values)

    return {
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        attachments: comment.attachments,
        isInternal: comment.is_internal,
        isResolved: comment.is_resolved,
        updatedAt: comment.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update comment'
    })
  }
})
