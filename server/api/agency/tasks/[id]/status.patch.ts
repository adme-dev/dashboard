/**
 * Update task status (quick status change for drag-drop)
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { dispatchTaskStatusChangeEffects } from '~~/server/utils/workManagement/taskEffects'
import { requireBoardAccess, requireWriteAccess } from '~~/server/utils/auth'

interface UpdateStatusBody {
  statusId: string
  expectedVersion?: number // For optimistic locking / conflict detection
}

function isHttpError(error: unknown): error is { statusCode: number } {
  return typeof error === 'object'
    && error !== null
    && 'statusCode' in error
    && typeof error.statusCode === 'number'
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const actorUserId = user.id
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

    await requireBoardAccess(event, currentTask.department_id)

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
    const newStatus = await queryOne(`
      SELECT *
      FROM task_statuses
      WHERE id = $1
        AND (department_id IS NULL OR department_id = $2)
    `, [body.statusId, currentTask.department_id])
    if (!newStatus) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid status ID for this board'
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
      `, [body.statusId, id, actorUserId])

      // Log status change activity
      await client.query(`
        INSERT INTO task_activities (task_id, user_id, activity_type, content, old_value, new_value)
        VALUES ($1, $2, 'status_change', $3, $4, $5)
      `, [
        id,
        actorUserId,
        `Changed status from "${currentTask.old_status_name}" to "${newStatus.name}"`,
        JSON.stringify({ statusId: currentTask.status_id, statusName: currentTask.old_status_name }),
        JSON.stringify({ statusId: newStatus.id, statusName: newStatus.name })
      ])
    })

    dispatchTaskStatusChangeEffects(event, { task: currentTask, newStatus, actorUserId })

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
        isFinal: updatedTask.status_is_final
      }
    }
  } catch (error: unknown) {
    if (isHttpError(error)) throw error
    console.error('Failed to update task status:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update task status'
    })
  }
})
