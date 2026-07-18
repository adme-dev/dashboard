/**
 * Add a comment to a task
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { notifyMention, notifyTaskComment } from '~~/server/utils/notifications'
import { autoSubscribeIfEnabled } from '~~/server/utils/subscriptions'

interface AddCommentBody {
  content: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
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
    // Verify task exists and get details for notifications
    const task = await queryOne('SELECT id, title, assignee_id, reporter_id, department_id FROM tasks WHERE id = $1', [id])
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
    `, [id, user.id, body.content.trim()])

    const userInfo = await queryOne('SELECT id, name, email FROM team_members WHERE id = $1', [user.id])

    // Notify task stakeholders about the comment (assignee, reporter)
    notifyTaskComment({
      taskId: id,
      taskTitle: task.title || 'Task',
      commenterId: user.id,
      assigneeId: task.assignee_id,
      reporterId: task.reporter_id,
      commentSnippet: body.content.substring(0, 100)
    }).catch(err => console.error('Failed to send comment notification:', err))

    // Auto-subscribe the commenter to this task's activity at item scope.
    if (task.department_id) {
      autoSubscribeIfEnabled(user.id, task.department_id, id).catch(err =>
        console.error('Auto-subscribe commenter failed:', err)
      )
    }

    // Extract @mentions from content and notify users (separately from general comment notifications)
    const mentionMatches = body.content.match(/@(\w+)/g)
    if (mentionMatches) {
      // Find mentioned users by name pattern
      const mentionNames = mentionMatches.map(m => m.substring(1).toLowerCase())
      const mentionedUsers = await queryRows(`
        SELECT id, name FROM team_members
        WHERE LOWER(REPLACE(name, ' ', '')) LIKE ANY($1::text[])
          OR LOWER(name) LIKE ANY($1::text[])
      `, [mentionNames.map(n => `%${n}%`)])

      // Send notifications for @mentions (higher priority than general comment)
      for (const mentionedUser of mentionedUsers) {
        if (mentionedUser.id !== user.id) {
          notifyMention({
            mentionedUserId: mentionedUser.id,
            taskId: id,
            taskTitle: task.title || 'Task',
            mentionerId: user.id,
            commentSnippet: body.content.substring(0, 100)
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
      user: userInfo
        ? {
            id: userInfo.id,
            name: userInfo.name,
            email: userInfo.email
          }
        : null
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to add comment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to add comment'
    })
  }
})
