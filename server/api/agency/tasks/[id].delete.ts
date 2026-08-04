/**
 * Delete a task (soft delete by marking as cancelled)
 */

import { requireWriteAccess } from '~~/server/utils/auth'
import { prepareKnowledgeSourceDeletion } from '~~/server/utils/boardKnowledge/deletion'
import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { deleteFile, isStorageConfigured } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
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
    const task = await queryOne('SELECT id, title, department_id FROM tasks WHERE id = $1', [id])
    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    if (hardDelete) {
      const attachments = await queryRows<{ id: string, storage_key: string | null }>(`
        SELECT id, storage_key
        FROM task_attachments
        WHERE task_id = $1
      `, [id])

      for (const attachment of attachments) {
        await prepareKnowledgeSourceDeletion(event, {
          departmentId: task.department_id,
          sourceType: 'task_attachment',
          sourceId: attachment.id,
          actorId: user.id
        })
      }

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

      if (isStorageConfigured()) {
        for (const attachment of attachments) {
          if (!attachment.storage_key) continue
          await deleteFile(attachment.storage_key).catch((storageError) => {
            console.warn('Failed to delete task attachment from storage:', storageError)
          })
        }
      }

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

        // Log deletion as a status_change — 'deleted' is NOT an allowed activity_type
        // (task_activities_activity_type_check), which made every soft delete throw a generic 500.
        await client.query(`
          INSERT INTO task_activities (task_id, activity_type, content)
          VALUES ($1, 'status_change', $2)
        `, [id, `Task "${task.title}" was deleted (cancelled)`])
      })

      return { success: true, message: 'Task marked as cancelled' }
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to delete task:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete task'
    })
  }
})
