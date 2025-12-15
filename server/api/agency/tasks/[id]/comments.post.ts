/**
 * Add a comment to a task
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { notifyMention } from '~~/server/utils/notifications'

interface AddCommentBody {
  content: string
  userId?: string
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<AddCommentBody>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  if (!body.content?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Comment content is required'
    })
  }

  try {
    // Verify task exists and get title for notifications
    const task = await queryOne('SELECT id, title FROM tasks WHERE id = $1', [id])
    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    // Create comment as activity
    const comment = await queryOne(`
      INSERT INTO task_activities (task_id, user_id, activity_type, content)
      VALUES ($1, $2, 'comment', $3)
      RETURNING *
    `, [id, body.userId || null, body.content.trim()])

    // Get user info if provided
    let user = null
    if (body.userId) {
      user = await queryOne('SELECT id, name, email FROM team_members WHERE id = $1', [body.userId])
    }

    // Extract @mentions from content and notify users
    const mentionMatches = body.content.match(/@(\w+)/g)
    if (mentionMatches && body.userId) {
      // Find mentioned users by name pattern
      const mentionNames = mentionMatches.map(m => m.substring(1).toLowerCase())
      const mentionedUsers = await queryRows(`
        SELECT id, name FROM team_members
        WHERE LOWER(REPLACE(name, ' ', '')) LIKE ANY($1::text[])
          OR LOWER(name) LIKE ANY($1::text[])
      `, [mentionNames.map(n => `%${n}%`)])

      // Send notifications
      for (const mentionedUser of mentionedUsers) {
        if (mentionedUser.id !== body.userId) {
          notifyMention({
            userId: mentionedUser.id,
            taskId: id,
            taskTitle: task.title || 'Task',
            mentionedById: body.userId,
            commentPreview: body.content.substring(0, 100)
          }).catch(err => console.error('Failed to send mention notification:', err))
        }
      }
    }

    return {
      id: comment.id,
      taskId: comment.task_id,
      type: 'comment',
      content: comment.content,
      createdAt: comment.created_at,
      user: user ? {
        id: user.id,
        name: user.name,
        email: user.email,
      } : null,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to add comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to add comment'
    })
  }
})
