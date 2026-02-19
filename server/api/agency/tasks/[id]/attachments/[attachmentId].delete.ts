/**
 * Delete Task Attachment
 * DELETE /api/agency/tasks/:id/attachments/:attachmentId
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { deleteFile, isStorageConfigured } from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const taskId = getRouterParam(event, 'id')
  const attachmentId = getRouterParam(event, 'attachmentId')

  if (!taskId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  if (!attachmentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Attachment ID is required'
    })
  }

  try {
    // Verify task exists and get attachment
    const attachment = await queryOne(`
      SELECT
        ta.id,
        ta.task_id,
        ta.file_name,
        ta.storage_key,
        ta.uploaded_by,
        t.assignee_id,
        t.reporter_id
      FROM task_attachments ta
      JOIN tasks t ON ta.task_id = t.id
      WHERE ta.id = $1 AND ta.task_id = $2
    `, [attachmentId, taskId])

    if (!attachment) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Attachment not found'
      })
    }

    // Check permission - uploader, assignee, or reporter can delete
    const canDelete = attachment.uploaded_by === user.id ||
                      attachment.assignee_id === user.id ||
                      attachment.reporter_id === user.id

    if (!canDelete) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You do not have permission to delete this attachment'
      })
    }

    await transaction(async (client) => {
      // Delete from database
      await client.query(
        `DELETE FROM task_attachments WHERE id = $1`,
        [attachmentId]
      )

      // Log activity
      await client.query(`
        INSERT INTO task_activities (task_id, user_id, activity_type, content)
        VALUES ($1, $2, 'attachment_removed', $3)
      `, [taskId, user.id, `Removed attachment "${attachment.file_name}"`])
    })

    // Delete from storage if configured
    if (attachment.storage_key && isStorageConfigured()) {
      try {
        await deleteFile(attachment.storage_key)
      } catch (storageError) {
        console.warn('Failed to delete file from storage:', storageError)
        // Don't fail the request if storage deletion fails
      }
    }

    return {
      success: true,
      message: 'Attachment deleted successfully'
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete attachment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete attachment'
    })
  }
})
