/**
 * Delete a comment (soft delete)
 * DELETE /api/comments/:id
 */

import { createError, getRouterParam } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { queryOne } from '../../../utils/db'

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const commentId = getRouterParam(event, 'id')

  if (!commentId) {
    throw createError({ statusCode: 400, statusMessage: 'Comment ID required' })
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
      throw createError({ statusCode: 400, statusMessage: 'Comment already deleted' })
    }

    // Only author can delete (or admin - could add role check here)
    if (existing.user_id !== user.id) {
      throw createError({ statusCode: 403, statusMessage: 'Can only delete your own comments' })
    }

    // Soft delete
    await queryOne(`
      UPDATE task_activities 
      SET is_deleted = true, deleted_at = NOW(), deleted_by = $1
      WHERE id = $2
      RETURNING id
    `, [user.id, commentId])

    return { success: true, id: commentId }

  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to delete comment: ${error.message}`
    })
  }
})
