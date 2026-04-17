/**
 * Send Due Date Reminder Notifications
 * POST /api/notifications/send-due-reminders
 *
 * This endpoint should be called by a cron job (e.g., daily at 9am)
 * It finds tasks due soon (within 1-3 days) and overdue tasks,
 * then sends notifications to assignees.
 *
 * Headers:
 * - x-cron-secret: Secret key to authorize cron job calls
 */

import { queryRows } from '~~/server/utils/db'
import { notifyDueReminder } from '~~/server/utils/notifications'

export default defineEventHandler(async (event) => {
  // Verify cron secret (simple protection for cron endpoint)
  const cronSecret = getHeader(event, 'x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  // Allow in development without secret, require in production
  if (process.env.NODE_ENV === 'production' && cronSecret !== expectedSecret) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  try {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const threeDaysLater = new Date(now)
    threeDaysLater.setDate(threeDaysLater.getDate() + 3)

    // Find tasks due within 1-3 days (not completed, not already reminded today)
    const dueSoonTasks = await queryRows(`
      SELECT
        t.id, t.title, t.due_date, t.assignee_id
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.assignee_id IS NOT NULL
        AND t.due_date IS NOT NULL
        AND t.due_date BETWEEN $1 AND $2
        AND t.status_is_final = false
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = t.assignee_id
            AND n.type = 'task_due_soon'
            AND n.metadata->>'taskId' = t.id::text
            AND n.created_at > NOW() - INTERVAL '20 hours'
        )
    `, [tomorrow.toISOString().split('T')[0], threeDaysLater.toISOString().split('T')[0]])

    // Find overdue tasks (not completed, not already reminded today)
    const overdueTasks = await queryRows(`
      SELECT
        t.id, t.title, t.due_date, t.assignee_id
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.assignee_id IS NOT NULL
        AND t.due_date IS NOT NULL
        AND t.due_date < $1
        AND t.status_is_final = false
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = t.assignee_id
            AND n.type = 'task_overdue'
            AND n.metadata->>'taskId' = t.id::text
            AND n.created_at > NOW() - INTERVAL '20 hours'
        )
    `, [now.toISOString().split('T')[0]])

    // Send due soon notifications
    let dueSoonSent = 0
    for (const task of dueSoonTasks) {
      try {
        await notifyDueReminder({
          taskId: task.id,
          taskTitle: task.title,
          assigneeId: task.assignee_id,
          dueDate: new Date(task.due_date),
          isOverdue: false
        })
        dueSoonSent++
      } catch (error) {
        console.error(`Failed to send due soon reminder for task ${task.id}:`, error)
      }
    }

    // Send overdue notifications
    let overdueSent = 0
    for (const task of overdueTasks) {
      try {
        await notifyDueReminder({
          taskId: task.id,
          taskTitle: task.title,
          assigneeId: task.assignee_id,
          dueDate: new Date(task.due_date),
          isOverdue: true
        })
        overdueSent++
      } catch (error) {
        console.error(`Failed to send overdue reminder for task ${task.id}:`, error)
      }
    }

    return {
      success: true,
      processed: {
        dueSoonTasks: dueSoonTasks.length,
        dueSoonSent,
        overdueTasks: overdueTasks.length,
        overdueSent
      },
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    console.error('Failed to process due date reminders:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to process due date reminders'
    })
  }
})
