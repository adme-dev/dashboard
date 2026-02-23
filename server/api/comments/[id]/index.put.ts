/**
 * Edit a comment
 * PUT /api/comments/:id
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { queryOne } from '../../../utils/db'

interface UpdateCommentBody {
  content: string
}

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const commentId = getRouterParam(event, 'id')
  const body = await readBody<UpdateCommentBody>(event)

  if (!commentId) {
    throw createError({ statusCode: 400, statusMessage: 'Comment ID required' })
  }

  if (!body.content?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Comment content is required' })
  }

  try {
    // Check ownership
    const existing = await queryOne(`
      SELECT id, user_id, is_deleted FROM task_activities 
      WHERE id = $1 AND activity_type = 'comment'
    `, [commentId])

    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
    }

    if (existing.is_deleted) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot edit deleted comment' })
    }

    // Only author can edit (or admin - could add role check here)
    if (existing.user_id !== user.id) {
      throw createError({ statusCode: 403, statusMessage: 'Can only edit your own comments' })
    }

    // Update the comment
    const updated = await queryOne(`
      UPDATE task_activities 
      SET content = $1, edited_at = NOW()
      WHERE id = $2
      RETURNING id, content, edited_at, created_at
    `, [body.content.trim(), commentId])

    return updated

  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to update comment: ${error.message}`
    })
  }
})
