/**
 * Confirm File Upload
 * POST /api/storage/confirm-upload
 *
 * After a client uploads a file directly to R2 using a presigned URL,
 * they call this endpoint to confirm the upload and get the final file URL.
 * This also allows us to track uploaded files in the database if needed.
 */

import { requireAuth } from '~~/server/utils/auth'
import {
  fileExists,
  getFileMetadata,
  getPublicUrl,
  getPresignedDownloadUrl,
  isStorageConfigured,
  type FileCategory
} from '~~/server/utils/storage'
import { queryOne } from '~~/server/utils/db'

interface ConfirmUploadRequest {
  key: string
  category: FileCategory
  entityId?: string
  entityType?: 'task' | 'expense' | 'brief' | 'invoice' | 'avatar'
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<ConfirmUploadRequest>(event)

  if (!isStorageConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'File storage is not configured'
    })
  }

  if (!body.key?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Storage key is required'
    })
  }

  try {
    // Verify file exists in R2
    const exists = await fileExists(body.key)
    if (!exists) {
      throw createError({
        statusCode: 404,
        statusMessage: 'File not found. Upload may have failed or expired.'
      })
    }

    // Get file metadata
    const metadata = await getFileMetadata(body.key)
    if (!metadata) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Could not retrieve file metadata'
      })
    }

    // Generate URL (public URL if configured, otherwise presigned)
    const publicUrl = getPublicUrl(body.key)
    const url = publicUrl || await getPresignedDownloadUrl(body.key, 7 * 24 * 60 * 60) // 7 days

    // Track the upload in database (optional, based on entity type)
    if (body.entityType && body.entityId) {
      await trackUpload(body.entityType, body.entityId, body.key, metadata, user.id)
    }

    return {
      success: true,
      file: {
        key: body.key,
        url,
        size: metadata.size,
        contentType: metadata.contentType,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.id
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to confirm upload:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to confirm upload'
    })
  }
})

/**
 * Track uploaded file in appropriate database table
 */
async function trackUpload(
  entityType: string,
  entityId: string,
  key: string,
  metadata: { size: number; contentType: string },
  userId: string
) {
  const fileName = key.split('/').pop() || key

  switch (entityType) {
    case 'task':
      // Insert into task_attachments
      await queryOne(`
        INSERT INTO task_attachments (task_id, file_name, file_type, file_size, file_url, storage_key, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [entityId, fileName, metadata.contentType, metadata.size, key, key, userId])
      break

    case 'expense':
      // Update expense with receipt
      await queryOne(`
        UPDATE expenses
        SET receipt_url = $1, receipt_storage_key = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id
      `, [key, key, entityId])
      break

    case 'avatar':
      // Update team member avatar
      await queryOne(`
        UPDATE team_members
        SET avatar_url = $1, avatar_storage_key = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id
      `, [key, key, entityId])
      break

    // Add more entity types as needed
  }
}
