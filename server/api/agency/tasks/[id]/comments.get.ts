/**
 * List Task Comments
 * GET /api/agency/tasks/:id/comments
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const taskId = getRouterParam(event, 'id')
  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  if (!taskId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  try {
    // Verify task exists
    const task = await queryOne('SELECT id FROM tasks WHERE id = $1', [taskId])
    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    // Get total count
    const countResult = await queryOne(`
      SELECT COUNT(*) as total
      FROM task_activities
      WHERE task_id = $1 AND activity_type = 'comment'
    `, [taskId])

    // Get comments with user info
    const comments = await queryRows(`
      SELECT
        ta.id,
        ta.task_id,
        ta.content,
        ta.created_at,
        ta.edited_at,
        tm.id as user_id,
        tm.name as user_name,
        tm.email as user_email,
        tm.avatar_url as user_avatar
      FROM task_activities ta
      LEFT JOIN team_members tm ON ta.user_id = tm.id
      WHERE ta.task_id = $1 AND ta.activity_type = 'comment'
      ORDER BY ta.created_at DESC
      LIMIT $2 OFFSET $3
    `, [taskId, limit, offset])

    return {
      comments: comments.map(c => ({
        id: c.id,
        taskId: c.task_id,
        content: c.content,
        createdAt: c.created_at,
        updatedAt: c.edited_at,
        user: c.user_id
          ? {
              id: c.user_id,
              name: c.user_name,
              email: c.user_email,
              avatarUrl: c.user_avatar
            }
          : null
      })),
      pagination: {
        total: Number(countResult?.total) || 0,
        limit,
        offset,
        hasMore: offset + comments.length < Number(countResult?.total)
      }
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to fetch comments:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch comments'
    })
  }
})
