/**
 * Add an attachment to a task
 *
 * Supports two modes:
 * 1. Direct file upload via multipart form data (uses R2 when configured)
 * 2. Metadata-only mode when file was uploaded separately via presigned URL
 */

import { queryOne, transaction } from '~~/server/utils/db'
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

interface AddAttachmentBody {
  fileName: string
  fileType: string
  fileSize: number
  fileUrl?: string // Optional: provided if uploaded via presigned URL
  storageKey?: string // Optional: storage key if uploaded via presigned URL
  uploadedBy?: string
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Task ID is required'
    })
  }

  // Verify task exists
  const task = await queryOne('SELECT id, title FROM tasks WHERE id = $1', [id])
  if (!task) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Task not found'
    })
  }

  // Check if this is a multipart form upload or JSON metadata
  const contentType = getHeader(event, 'content-type') || ''
  const isMultipart = contentType.includes('multipart/form-data')

  try {
    let fileName: string
    let fileType: string
    let fileSize: number
    let fileUrl: string
    let storageKey: string | null = null
    let uploadedBy: string | null = null

    if (isMultipart) {
      // Direct file upload via multipart form
      const formData = await readMultipartFormData(event)

      if (!formData || formData.length === 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'No file uploaded'
        })
      }

      const file = formData.find(f => f.name === 'file')
      const uploaderField = formData.find(f => f.name === 'uploadedBy')

      if (!file) {
        throw createError({
          statusCode: 400,
          statusMessage: 'File is required'
        })
      }

      fileName = file.filename || 'attachment'
      fileType = file.type || 'application/octet-stream'
      fileSize = file.data.length
      uploadedBy = uploaderField?.data?.toString() || null

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
          uploadedBy: uploadedBy || '',
          originalName: fileName,
        })
        fileUrl = getPublicUrl(storageKey) || await getPresignedDownloadUrl(storageKey, 7 * 24 * 60 * 60)
      } else {
        // Fallback: store as base64 data URL (not recommended for large files)
        const base64 = file.data.toString('base64')
        fileUrl = `data:${fileType};base64,${base64}`
      }
    } else {
      // JSON metadata mode (file uploaded via presigned URL)
      const body = await readBody<AddAttachmentBody>(event)

      if (!body.fileName?.trim()) {
        throw createError({
          statusCode: 400,
          statusMessage: 'File name is required'
        })
      }

      if (!body.fileUrl?.trim() && !body.storageKey?.trim()) {
        throw createError({
          statusCode: 400,
          statusMessage: 'File URL or storage key is required'
        })
      }

      fileName = body.fileName.trim()
      fileType = body.fileType || 'application/octet-stream'
      fileSize = body.fileSize || 0
      storageKey = body.storageKey?.trim() || null
      uploadedBy = body.uploadedBy || null

      // Generate URL from storage key if not provided
      if (body.storageKey && !body.fileUrl) {
        fileUrl = getPublicUrl(body.storageKey) || await getPresignedDownloadUrl(body.storageKey, 7 * 24 * 60 * 60)
      } else {
        fileUrl = body.fileUrl!.trim()
      }
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
        uploadedBy,
      ])

      const attachment = attachmentResult.rows[0]

      // Log activity
      await client.query(`
        INSERT INTO task_activities (task_id, user_id, activity_type, content)
        VALUES ($1, $2, 'attachment', $3)
      `, [
        id,
        uploadedBy,
        `Added attachment "${fileName}"`,
      ])

      return attachment
    })

    // Get uploader info
    let uploader = null
    if (uploadedBy) {
      uploader = await queryOne('SELECT id, name, email FROM team_members WHERE id = $1', [uploadedBy])
    }

    return {
      id: result.id,
      taskId: result.task_id,
      fileName: result.file_name,
      fileType: result.file_type,
      fileSize: result.file_size,
      fileUrl: result.file_url,
      storageKey: result.storage_key,
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
