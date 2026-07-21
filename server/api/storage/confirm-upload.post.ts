/**
 * Confirm File Upload
 * POST /api/storage/confirm-upload
 *
 * After a client uploads a file directly to R2 using a presigned URL,
 * they call this endpoint to confirm the upload and get the final file URL.
 * This also allows us to track uploaded files in the database if needed.
 */

import { requireWriteAccess } from '~~/server/utils/auth'
import { z } from 'zod'
import {
  fileExists,
  getFileMetadata,
  getPublicUrl,
  getPresignedDownloadUrl,
  isStorageConfigured
} from '~~/server/utils/storage'
import { queryOne } from '~~/server/utils/db'
import {
  requireStorageEntityAccess,
  storageUploadCapabilityMatches,
  verifyStorageUploadCapability
} from '~~/server/utils/storageAccess'

const ConfirmUploadRequestSchema = z.object({
  key: z.string().trim().min(1).max(1024),
  confirmationToken: z.string().trim().min(1).max(4096)
}).strict()

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsedBody = ConfirmUploadRequestSchema.safeParse(await readBody(event))
  if (!parsedBody.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid upload confirmation request' })
  }
  const body = parsedBody.data

  if (!isStorageConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'File storage is not configured'
    })
  }

  const secret = useRuntimeConfig(event).sessionSecret
  if (typeof secret !== 'string' || secret.length < 32) {
    throw createError({ statusCode: 503, statusMessage: 'Secure upload confirmation is not configured' })
  }

  const capability = await verifyStorageUploadCapability(body.confirmationToken, secret, { actorId: user.id })
  if (!capability) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid or expired upload confirmation capability' })
  }
  const requestIdentity = {
    actorId: user.id,
    key: body.key,
    category: capability.category,
    entityType: capability.entityType,
    entityId: capability.entityId
  }
  if (!storageUploadCapabilityMatches(capability, requestIdentity)) {
    throw createError({ statusCode: 403, statusMessage: 'Invalid or expired upload confirmation capability' })
  }

  await requireStorageEntityAccess({
    category: requestIdentity.category,
    entityType: requestIdentity.entityType,
    entityId: requestIdentity.entityId,
    actorId: requestIdentity.actorId
  })

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

    if (!storageUploadCapabilityMatches(capability, {
      ...requestIdentity,
      fileType: metadata.contentType,
      fileSize: metadata.size
    })) {
      throw createError({ statusCode: 409, statusMessage: 'Uploaded object does not match the authorised file' })
    }

    // Generate URL (public URL if configured, otherwise presigned)
    const publicUrl = getPublicUrl(body.key)
    const url = publicUrl || await getPresignedDownloadUrl(body.key, 7 * 24 * 60 * 60) // 7 days

    // Track the upload in database (optional, based on entity type)
    await trackUpload(capability.entityType, capability.entityId, body.key, metadata, user.id)

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
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
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
  entityType: 'task' | 'expense' | 'avatar',
  entityId: string,
  key: string,
  metadata: { size: number, contentType: string },
  userId: string
) {
  const fileName = key.split('/').pop() || key

  switch (entityType) {
    case 'task':
      if (!await queryOne(`
        INSERT INTO task_attachments (task_id, file_name, file_type, file_size, file_url, storage_key, uploaded_by)
        SELECT t.id, $2, $3, $4, $5, $6, $7
          FROM tasks t
         WHERE t.id = $1
           AND (t.assignee_id = $7 OR t.reporter_id = $7)
        RETURNING id
      `, [entityId, fileName, metadata.contentType, metadata.size, key, key, userId])) {
        throw createError({ statusCode: 403, statusMessage: 'You do not have permission to attach this file' })
      }
      break

    case 'expense':
      // Update expense with receipt
      if (!await queryOne(`
        UPDATE expenses
        SET receipt_url = $1, receipt_storage_key = $2, updated_at = NOW()
        WHERE id = $3 AND user_id = $4
        RETURNING id
      `, [key, key, entityId, userId])) {
        throw createError({ statusCode: 403, statusMessage: 'You do not have permission to attach this receipt' })
      }
      break

    case 'avatar':
      // Update team member avatar
      if (!await queryOne(`
        UPDATE team_members
        SET avatar_url = $1, avatar_storage_key = $2, updated_at = NOW()
        WHERE id = $3 AND id = $4
        RETURNING id
      `, [key, key, entityId, userId])) {
        throw createError({ statusCode: 403, statusMessage: 'You do not have permission to set this avatar' })
      }
      break
  }
}
