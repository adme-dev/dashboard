/**
 * Delete Task Comment
 * DELETE /api/agency/tasks/:id/comments/:commentId
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const taskId = getRouterParam(event, 'id')
  const commentId = getRouterParam(event, 'commentId')

  if (!taskId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  if (!commentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Comment ID is required'
    })
  }

  try {
    // Verify comment exists and belongs to task
    const comment = await queryOne(`
      SELECT id, user_id, content
      FROM task_activities
      WHERE id = $1 AND task_id = $2 AND activity_type = 'comment'
    `, [commentId, taskId])

    if (!comment) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Comment not found'
      })
    }

    // Only the comment author can delete their own comment
    if (comment.user_id !== user.id) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You can only delete your own comments'
      })
    }

    // Delete the comment
    await queryOne(
      `DELETE FROM task_activities WHERE id = $1 RETURNING id`,
      [commentId]
    )

    return {
      success: true,
      message: 'Comment deleted successfully'
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete comment'
    })
  }
})
