/**
 * List Task Attachments
 * GET /api/agency/tasks/:id/attachments
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const taskId = getRouterParam(event, 'id')

  if (!taskId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  try {
    // Verify task exists
    const task = await queryOne('SELECT id FROM tasks WHERE id = $1', [taskId])
    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    // Get attachments with uploader info
    const attachments = await queryRows(`
      SELECT
        ta.id,
        ta.task_id,
        ta.file_name,
        ta.file_url,
        ta.file_type,
        ta.file_size,
        ta.storage_key,
        ta.thumbnail_url,
        ta.created_at,
        tm.id as uploader_id,
        tm.name as uploader_name,
        tm.email as uploader_email
      FROM task_attachments ta
      LEFT JOIN team_members tm ON ta.uploaded_by = tm.id
      WHERE ta.task_id = $1
      ORDER BY ta.created_at DESC
    `, [taskId])

    return attachments.map(a => ({
      id: a.id,
      taskId: a.task_id,
      fileName: a.file_name,
      fileUrl: a.file_url,
      fileType: a.file_type,
      fileSize: a.file_size,
      storageKey: a.storage_key,
      thumbnailUrl: a.thumbnail_url,
      createdAt: a.created_at,
      uploadedBy: a.uploader_id ? {
        id: a.uploader_id,
        name: a.uploader_name,
        email: a.uploader_email
      } : null
    }))
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch attachments:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch attachments'
    })
  }
})
