/**
 * Update Task Comment
 * PUT /api/agency/tasks/:id/comments/:commentId
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateCommentBody {
  content: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const taskId = getRouterParam(event, 'id')
  const commentId = getRouterParam(event, 'commentId')
  const body = await readBody<UpdateCommentBody>(event)

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

  if (!body.content?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Comment content is required'
    })
  }

  try {
    // Verify comment exists and belongs to task
    const comment = await queryOne(`
      SELECT id, user_id
      FROM task_activities
      WHERE id = $1 AND task_id = $2 AND activity_type = 'comment'
    `, [commentId, taskId])

    if (!comment) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Comment not found'
      })
    }

    // Only the comment author can edit their own comment
    if (comment.user_id !== user.id) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You can only edit your own comments'
      })
    }

    // Update the comment
    const updated = await queryOne(`
      UPDATE task_activities
      SET content = $1, edited_at = NOW()
      WHERE id = $2
      RETURNING id, content, edited_at
    `, [body.content.trim(), commentId])

    // Get user info for response
    const userInfo = await queryOne(
      `SELECT id, name, email, avatar_url FROM team_members WHERE id = $1`,
      [user.id]
    )

    return {
      id: updated.id,
      taskId,
      content: updated.content,
      updatedAt: updated.edited_at,
      user: userInfo
        ? {
            id: userInfo.id,
            name: userInfo.name,
            email: userInfo.email,
            avatarUrl: userInfo.avatar_url
          }
        : null
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to update comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update comment'
    })
  }
})
