/**
 * Create a comment on a task
 * POST /api/tasks/:id/comments
 */

import { createError, getRouterParam, readBody } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { queryOne } from '../../../utils/db'

interface CreateCommentBody {
  content: string
  parentId?: string
  isInternal?: boolean
}

export default eventHandler(async (event) => {
  const user = await requireAuth(event)
  const taskId = getRouterParam(event, 'id')
  const body = await readBody<CreateCommentBody>(event)

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: 'Task ID required' })
  }

  if (!body.content?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Comment content is required' })
  }

  try {
    // Verify task exists and get board info for the response
    const task = await queryOne(`
      SELECT t.id, d.slug as board_slug
      FROM tasks t
      JOIN departments d ON t.department_id = d.id
      WHERE t.id = $1
    `, [taskId])

    if (!task) {
      throw createError({ statusCode: 404, statusMessage: 'Task not found' })
    }

    // Validate parent comment if provided
    if (body.parentId) {
      const parentComment = await queryOne(`
        SELECT id, parent_id FROM task_activities 
        WHERE id = $1 AND task_id = $2 AND activity_type = 'comment' AND is_deleted = false
      `, [body.parentId, taskId])

      if (!parentComment) {
        throw createError({ statusCode: 404, statusMessage: 'Parent comment not found' })
      }

      // Prevent nested replies (only 1 level deep)
      if (parentComment.parent_id) {
        throw createError({ statusCode: 400, statusMessage: 'Cannot reply to a reply' })
      }
    }

    // Create the comment
    const comment = await queryOne(`
      INSERT INTO task_activities (task_id, user_id, activity_type, content, parent_id, is_internal)
      VALUES ($1, $2, 'comment', $3, $4, $5)
      RETURNING 
        id,
        task_id,
        user_id as author_id,
        content,
        parent_id,
        is_internal,
        created_at
    `, [
      taskId,
      user.id,
      body.content.trim(),
      body.parentId || null,
      body.isInternal || false
    ])

    // Get author info
    const author = await queryOne(`
      SELECT name, avatar_url FROM team_members WHERE id = $1
    `, [user.id])

    // Return full comment object
    return {
      ...comment,
      author_name: author?.name,
      author_avatar: author?.avatar_url,
      likes_count: 0,
      user_has_liked: false,
      reply_count: 0,
      replies: [],
      mentions: []
    }

  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to create comment: ${error.message}`
    })
  }
})
