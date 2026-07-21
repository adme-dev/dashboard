/**
 * Add an attachment to a task
 *
 * Accepts direct multipart uploads only. Presigned uploads are confirmed through
 * the actor-bound generic storage confirmation endpoint.
 */

import { queryOne, transaction } from '~~/server/utils/db'
import { requireBoardAccess, requireWriteAccess } from '~~/server/utils/auth'
import {
  isStorageConfigured,
  uploadFile,
  generateStorageKey,
  getPublicUrl,
  getPresignedDownloadUrl,
  validateFileType,
  validateFileSize,
  getMaxFileSize,
  getAllowedTypes
} from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  const contentType = getHeader(event, 'content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Task attachments require a direct multipart file upload'
    })
  }

  // Verify task exists
  const task = await queryOne('SELECT id, title, department_id FROM tasks WHERE id = $1', [id])
  if (!task) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Task not found'
    })
  }
  await requireBoardAccess(event, task.department_id)

  try {
    let fileUrl: string
    let storageKey: string | null = null
    const uploadedBy = user.id

    // Direct file upload via multipart form
    const formData = await readMultipartFormData(event)

    if (!formData || formData.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No file uploaded'
      })
    }

    const file = formData.find(f => f.name === 'file')

    if (!file) {
      throw createError({
        statusCode: 400,
        statusMessage: 'File is required'
      })
    }

    const fileName = file.filename || 'attachment'
    const fileType = file.type || 'application/octet-stream'
    const fileSize = file.data.length

    // Validate file type and size
    if (!validateFileType(fileType, 'attachments')) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid file type. Allowed types: ${getAllowedTypes('attachments').join(', ')}`
      })
    }

    if (!validateFileSize(fileSize, 'attachments')) {
      const maxSizeMB = Math.round(getMaxFileSize('attachments') / (1024 * 1024))
      throw createError({
        statusCode: 400,
        statusMessage: `File too large. Maximum size is ${maxSizeMB}MB`
      })
    }

    // Upload to R2 if configured
    if (isStorageConfigured()) {
      storageKey = generateStorageKey('attachments', fileName, id)
      await uploadFile(file.data, storageKey, fileType, {
        taskId: id,
        uploadedBy,
        originalName: fileName
      })
      fileUrl = getPublicUrl(storageKey) || await getPresignedDownloadUrl(storageKey, 7 * 24 * 60 * 60)
    } else {
      // Fallback: store as base64 data URL (not recommended for large files)
      const base64 = file.data.toString('base64')
      fileUrl = `data:${fileType};base64,${base64}`
    }

    const result = await transaction(async (client) => {
      // Create attachment
      const attachmentResult = await client.query(`
        INSERT INTO task_attachments (task_id, file_name, file_type, file_size, file_url, storage_key, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        id,
        fileName,
        fileType,
        fileSize,
        fileUrl,
        storageKey,
        uploadedBy
      ])

      const attachment = attachmentResult.rows[0]

      // Log activity
      await client.query(`
        INSERT INTO task_activities (task_id, user_id, activity_type, content)
        VALUES ($1, $2, 'attachment', $3)
      `, [
        id,
        uploadedBy,
        `Added attachment "${fileName}"`
      ])

      return attachment
    })

    // Get uploader info
    const uploader = await queryOne('SELECT id, name, email FROM team_members WHERE id = $1', [uploadedBy])

    return {
      id: result.id,
      taskId: result.task_id,
      fileName: result.file_name,
      fileType: result.file_type,
      fileSize: result.file_size,
      fileUrl: result.file_url,
      storageKey: result.storage_key,
      createdAt: result.created_at,
      uploadedBy: uploader
        ? {
            id: uploader.id,
            name: uploader.name,
            email: uploader.email
          }
        : null
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to add attachment:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to add attachment'
    })
  }
})
