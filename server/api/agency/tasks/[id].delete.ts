/**
 * Delete a task (soft delete by marking as cancelled)
 */

import { queryOne, transaction } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const query = getQuery(event)
  const hardDelete = query.hard === 'true'

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  try {
    // Check if task exists
    const task = await queryOne('SELECT id, title FROM tasks WHERE id = $1', [id])
    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    if (hardDelete) {
      // Hard delete - remove completely (cascades to related tables)
      await transaction(async (client) => {
        // Delete dependencies
        await client.query('DELETE FROM task_dependencies WHERE task_id = $1 OR depends_on_task_id = $1', [id])

        // Delete label assignments
        await client.query('DELETE FROM task_label_assignments WHERE task_id = $1', [id])

        // Delete attachments
        await client.query('DELETE FROM task_attachments WHERE task_id = $1', [id])

        // Delete activities
        await client.query('DELETE FROM task_activities WHERE task_id = $1', [id])

        // Delete approval responses and approvals
        await client.query(`
          DELETE FROM task_approval_responses
          WHERE approval_id IN (SELECT id FROM task_approvals WHERE task_id = $1)
        `, [id])
        await client.query('DELETE FROM task_approvals WHERE task_id = $1', [id])

        // Update subtasks to remove parent reference
        await client.query('UPDATE tasks SET parent_task_id = NULL WHERE parent_task_id = $1', [id])

        // Delete the task
        await client.query('DELETE FROM tasks WHERE id = $1', [id])
      })

      return { success: true, message: 'Task permanently deleted' }
    } else {
      // Soft delete - mark as cancelled
      const cancelledStatus = await queryOne(`
        SELECT id FROM task_statuses
        WHERE category = 'cancelled' AND is_final = true
        ORDER BY sort_order
        LIMIT 1
      `)

      if (!cancelledStatus) {
        throw createError({
          statusCode: 500,
          statusMessage: 'No cancelled status found'
        })
      }

      await transaction(async (client) => {
        // Update task to cancelled status
        await client.query(`
          UPDATE tasks
          SET status_id = $1, completed_at = NOW(), updated_at = NOW()
          WHERE id = $2
        `, [cancelledStatus.id, id])

        // Log deletion activity
        await client.query(`
          INSERT INTO task_activities (task_id, activity_type, content)
          VALUES ($1, 'deleted', $2)
        `, [id, `Task "${task.title}" was deleted`])
      })

      return { success: true, message: 'Task marked as cancelled' }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete task:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete task'
    })
  }
})
