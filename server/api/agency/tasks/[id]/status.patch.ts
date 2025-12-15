/**
 * Update task status (quick status change for drag-drop)
 */

import { queryOne, transaction } from '~~/server/utils/db'

interface UpdateStatusBody {
  statusId: string
  userId?: string
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
      // Update task status
      const completedAt = newStatus.is_final ? 'NOW()' : 'NULL'
      await client.query(`
        UPDATE tasks
        SET status_id = $1, completed_at = ${completedAt}, updated_at = NOW()
        WHERE id = $2
      `, [body.statusId, id])

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

    // Return updated task
    const updatedTask = await queryOne(`
      SELECT
        t.*,
        ts.name as status_name,
        ts.color as status_color,
        ts.category as status_category,
        ts.is_final as status_is_final
      FROM tasks t
      JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.id = $1
    `, [id])

    return {
      id: updatedTask.id,
      statusId: updatedTask.status_id,
      completedAt: updatedTask.completed_at,
      updatedAt: updatedTask.updated_at,
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
