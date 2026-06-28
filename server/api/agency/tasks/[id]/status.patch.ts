/**
 * Update task status (quick status change for drag-drop)
 */

import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { notifyTaskStatusChanged } from '~~/server/utils/notifications'
import { emitBoardEvent } from '~~/server/utils/boardEvents'
import { notifyBoardSubscribers } from '~~/server/utils/boardNotifications'
import { evaluateAutomations } from '~~/server/utils/automationEngine'
import { evaluateLifecycleTransition } from '~~/server/utils/automation/lifecycleGuard'
import { enqueue } from '~~/server/utils/queue'
import { postBoardEventToChat } from '~~/server/utils/boardChatBridge'
import { maybeProposeBriefCompletion } from '~~/server/utils/briefConversion/completionAlert'

interface UpdateStatusBody {
  statusId: string
  userId?: string
  expectedVersion?: number  // For optimistic locking / conflict detection
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<UpdateStatusBody>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  if (!body.statusId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Status ID is required'
    })
  }

  try {
    // Get current task
    const currentTask = await queryOne(`
      SELECT t.*, ts.name as old_status_name
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.id = $1
    `, [id])

    if (!currentTask) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    // Check for version conflict (optimistic locking)
    if (body.expectedVersion !== undefined && currentTask.version !== body.expectedVersion) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Task was modified by another user',
        data: {
          currentVersion: currentTask.version,
          expectedVersion: body.expectedVersion,
          lastModifiedBy: currentTask.last_modified_by,
          updatedAt: currentTask.updated_at
        }
      })
    }

    // Get new status info
    const newStatus = await queryOne('SELECT * FROM task_statuses WHERE id = $1', [body.statusId])
    if (!newStatus) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid status ID'
      })
    }

    // No change needed
    if (currentTask.status_id === body.statusId) {
      return { success: true, message: 'Status unchanged' }
    }

    await transaction(async (client) => {
      // Update task status with last_modified_by tracking
      const completedAt = newStatus.is_final ? 'NOW()' : 'NULL'
      await client.query(`
        UPDATE tasks
        SET status_id = $1, completed_at = ${completedAt}, updated_at = NOW(), last_modified_by = $3
        WHERE id = $2
      `, [body.statusId, id, body.userId || null])

      // Log status change activity
      await client.query(`
        INSERT INTO task_activities (task_id, user_id, activity_type, content, old_value, new_value)
        VALUES ($1, $2, 'status_change', $3, $4, $5)
      `, [
        id,
        body.userId || null,
        `Changed status from "${currentTask.old_status_name}" to "${newStatus.name}"`,
        JSON.stringify({ statusId: currentTask.status_id, statusName: currentTask.old_status_name }),
        JSON.stringify({ statusId: newStatus.id, statusName: newStatus.name }),
      ])
    })

    // Emit board event for real-time updates
    if (currentTask.department_id) {
      const statusChanges = {
        oldStatusId: currentTask.status_id,
        oldStatusName: currentTask.old_status_name,
        newStatusId: newStatus.id,
        newStatusName: newStatus.name,
      }

      emitBoardEvent({
        boardId: currentTask.department_id,
        type: 'status_changed',
        taskId: id,
        userId: body.userId,
        changes: statusChanges,
      }, event)

      const boardEvent = {
        boardId: currentTask.department_id,
        type: 'status_changed',
        taskId: id,
        actorId: body.userId || '',
        changes: statusChanges,
      }

      // Notify board subscribers (queued with retry, fallback to fire-and-forget)
      enqueue(event, 'board.notify', boardEvent, () => notifyBoardSubscribers(boardEvent))

      // Evaluate board automations (queued with retry, fallback to fire-and-forget)
      enqueue(event, 'board.automate', boardEvent, () => evaluateAutomations(currentTask.department_id, boardEvent))

      // A.3 lifecycle guard: observe the transition; raise an A.1 escalation for 🟡 gate
      // stages. Read-only to task state (never moves the task) — cannot double-fire vs the
      // engine above. Inert on generic statuses. (queued with retry, fire-and-forget fallback)
      enqueue(event, 'lifecycle.evaluate', boardEvent, async () => { await evaluateLifecycleTransition(boardEvent) })

      // Post to linked chat channels (fire-and-forget)
      postBoardEventToChat({
        ...boardEvent,
        taskTitle: currentTask.title,
      }).catch(() => {})
    }

    // Return updated task
    const updatedTask = await queryOne(`
      SELECT
        t.*,
        ts.name as status_name,
        ts.color as status_color,
        ts.category as status_category,
        t.status_is_final as status_is_final
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.id = $1
    `, [id])

    // Notify watchers about status change (assignee, reporter, and anyone who has interacted)
    const watcherIds = new Set<string>()
    if (currentTask.assignee_id && currentTask.assignee_id !== body.userId) {
      watcherIds.add(currentTask.assignee_id)
    }
    if (currentTask.reporter_id && currentTask.reporter_id !== body.userId) {
      watcherIds.add(currentTask.reporter_id)
    }

    if (watcherIds.size > 0) {
      notifyTaskStatusChanged(
        id,
        currentTask.title,
        currentTask.old_status_name,
        newStatus.name,
        body.userId || '',
        Array.from(watcherIds)
      ).catch(err => console.error('Failed to send status change notification:', err))
    }

    // G6: when a task reaches a final status, propose completing the brief this project came
    // from — only if every task is now done. AI-proposes / human-confirms, never auto-completes.
    if (newStatus.is_final && currentTask.project_id) {
      maybeProposeBriefCompletion({ projectId: currentTask.project_id, actorId: body.userId || null })
        .catch(err => console.error('[Brief] completion proposal failed:', err))
    }

    return {
      id: updatedTask.id,
      statusId: updatedTask.status_id,
      completedAt: updatedTask.completed_at,
      updatedAt: updatedTask.updated_at,
      version: updatedTask.version,
      lastModifiedBy: updatedTask.last_modified_by,
      status: {
        id: updatedTask.status_id,
        name: updatedTask.status_name,
        color: updatedTask.status_color,
        category: updatedTask.status_category,
        isFinal: updatedTask.status_is_final,
      },
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update task status:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update task status'
    })
  }
})
