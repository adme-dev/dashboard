/**
 * Internal: Create Task from Email
 * POST /api/internal/email-to-board
 *
 * Called by the Cloudflare email worker. Secured with INTERNAL_API_KEY.
 * Looks up board by email token, creates a task, emits board event,
 * and notifies board subscribers.
 */

import { queryOne, queryRows } from '~~/server/utils/db'
import { createBulkNotifications } from '~~/server/utils/notifications'
import { emitBoardEvent } from '~~/server/utils/boardEvents'

export default defineEventHandler(async (event) => {
  // Verify internal API key
  const authHeader = getHeader(event, 'authorization')
  const expectedKey = process.env.INTERNAL_API_KEY

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const { boardToken, from, subject, textBody, htmlBody, attachments } = body

  if (!boardToken || !from) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields' })
  }

  // Look up board by email token
  const board = await queryOne(
    'SELECT id, name FROM departments WHERE board_email_token = $1',
    [boardToken]
  )

  if (!board) {
    throw createError({ statusCode: 404, statusMessage: 'Board not found for this email address' })
  }

  // Get default status for new tasks
  const defaultStatus = await queryOne(
    'SELECT id FROM task_statuses WHERE department_id = $1 ORDER BY sort_order ASC LIMIT 1',
    [board.id]
  )

  if (!defaultStatus) {
    throw createError({ statusCode: 500, statusMessage: 'No task statuses configured for board' })
  }

  // Get first group for the board (or null)
  const defaultGroup = await queryOne(
    'SELECT id FROM board_groups WHERE department_id = $1 ORDER BY sort_order ASC LIMIT 1',
    [board.id]
  )

  // Create the task
  const description = textBody || htmlBody?.replace(/<[^>]*>/g, '') || ''
  const task = await queryOne(`
    INSERT INTO tasks (
      title, description, department_id, status_id, group_id,
      priority, task_type, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, title, created_at
  `, [
    subject || '(No Subject)',
    description.substring(0, 10000),
    board.id,
    defaultStatus.id,
    defaultGroup?.id || null,
    'medium',
    'task',
    JSON.stringify({
      source: 'email',
      senderEmail: from,
      attachmentCount: attachments?.length || 0,
      attachments: attachments || []
    })
  ])

  // Emit board event for real-time updates
  emitBoardEvent({
    boardId: board.id,
    type: 'task_created',
    taskId: task.id,
    changes: { title: subject, source: 'email', senderEmail: from }
  }, event)

  // Notify board subscribers about the new item from email
  try {
    const subscribers = await queryRows(`
      SELECT user_id FROM board_subscriptions
      WHERE board_id = $1 AND item_id IS NULL AND is_muted = false
    `, [board.id])

    if (subscribers.length > 0) {
      await createBulkNotifications(
        subscribers.map((s: any) => s.user_id),
        {
          type: 'system',
          title: 'New item from email',
          message: `"${subject}" was created on ${board.name} from an email by ${from}`,
          link: `/agency/boards/${board.id}`,
          metadata: { taskId: task.id, source: 'email', senderEmail: from }
        }
      )
    }
  } catch (err) {
    // board_subscriptions table may not exist yet — gracefully handle
    console.error('Failed to notify subscribers:', err)
  }

  return { success: true, taskId: task.id, taskTitle: task.title }
})
