/**
 * Add an attachment to a task
 * Note: This endpoint receives file metadata. The actual file upload
 * should be handled separately (e.g., to cloud storage like S3)
 */

import { queryOne, transaction } from '~~/server/utils/db'

interface AddAttachmentBody {
  fileName: string
  fileType: string
  fileSize: number
  fileUrl: string
  uploadedBy?: string
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<AddAttachmentBody>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  if (!body.fileName?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File name is required'
    })
  }

  if (!body.fileUrl?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File URL is required'
    })
  }

  try {
    // Verify task exists
    const task = await queryOne('SELECT id, title FROM tasks WHERE id = $1', [id])
    if (!task) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Task not found'
      })
    }

    const result = await transaction(async (client) => {
      // Create attachment
      const attachmentResult = await client.query(`
        INSERT INTO task_attachments (task_id, file_name, file_type, file_size, file_url, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        id,
        body.fileName.trim(),
        body.fileType || 'application/octet-stream',
        body.fileSize || 0,
        body.fileUrl.trim(),
        body.uploadedBy || null,
      ])

      const attachment = attachmentResult.rows[0]

      // Log activity
      await client.query(`
        INSERT INTO task_activities (task_id, user_id, activity_type, content)
        VALUES ($1, $2, 'attachment', $3)
      `, [
        id,
        body.uploadedBy || null,
        `Added attachment "${body.fileName}"`,
      ])

      return attachment
    })

    // Get uploader info
    let uploader = null
    if (body.uploadedBy) {
      uploader = await queryOne('SELECT id, name, email FROM team_members WHERE id = $1', [body.uploadedBy])
    }

    return {
      id: result.id,
      taskId: result.task_id,
      fileName: result.file_name,
      fileType: result.file_type,
      fileSize: result.file_size,
      fileUrl: result.file_url,
      createdAt: result.created_at,
      uploadedBy: uploader ? {
        id: uploader.id,
        name: uploader.name,
        email: uploader.email,
      } : null,
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to add attachment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to add attachment'
    })
  }
})
