/**
 * Generate Presigned Upload URL
 * POST /api/storage/presigned-upload
 *
 * Generates a presigned URL for direct client-to-R2 file uploads.
 * This is more efficient than uploading through the server.
 */

import { requireWriteAccess } from '~~/server/utils/auth'
import { z } from 'zod'
import {
  generateStorageKey,
  getPresignedUploadUrl,
  validateFileType,
  validateFileSize,
  getMaxFileSize,
  getAllowedTypes,
  isStorageConfigured
} from '~~/server/utils/storage'
import {
  requireStorageEntityAccess,
  resolveStorageUploadTarget,
  signStorageUploadCapability
} from '~~/server/utils/storageAccess'

const PresignedUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileType: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive(),
  category: z.enum(['avatars', 'attachments', 'expenses']),
  entityId: z.string().uuid()
}).strict()

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsedBody = PresignedUploadRequestSchema.safeParse(await readBody(event))
  if (!parsedBody.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid upload request' })
  }
  const body = parsedBody.data

  // Check if storage is configured
  if (!isStorageConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'File storage is not configured. Please contact administrator.'
    })
  }

  // Validate file type for category
  if (!validateFileType(body.fileType, body.category)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid file type for ${body.category}. Allowed types: ${getAllowedTypes(body.category).join(', ')}`
    })
  }

  // Validate file size for category
  if (!validateFileSize(body.fileSize, body.category)) {
    const maxSize = getMaxFileSize(body.category)
    const maxSizeMB = Math.round(maxSize / (1024 * 1024))
    throw createError({
      statusCode: 400,
      statusMessage: `File too large for ${body.category}. Maximum size: ${maxSizeMB}MB`
    })
  }

  const target = resolveStorageUploadTarget(body.category)
  if (!target) {
    throw createError({ statusCode: 400, statusMessage: 'This storage category does not support generic uploads' })
  }

  await requireStorageEntityAccess({
    category: body.category,
    entityType: target.entityType,
    entityId: body.entityId,
    actorId: user.id
  })

  const secret = useRuntimeConfig(event).sessionSecret
  if (typeof secret !== 'string' || secret.length < 32) {
    throw createError({ statusCode: 503, statusMessage: 'Secure upload confirmation is not configured' })
  }

  try {
    // Generate storage key
    const key = generateStorageKey(body.category, body.fileName, `${body.entityId}/${user.id}`)

    // Generate presigned upload URL (valid for 1 hour)
    const uploadUrl = await getPresignedUploadUrl(key, body.fileType, 3600)
    const confirmationToken = await signStorageUploadCapability({
      actorId: user.id,
      key,
      category: body.category,
      entityType: target.entityType,
      entityId: body.entityId,
      fileType: body.fileType,
      fileSize: body.fileSize
    }, secret)

    return {
      success: true,
      uploadUrl,
      key,
      confirmationToken,
      expiresIn: 3600,
      maxSize: getMaxFileSize(body.category),
      allowedTypes: getAllowedTypes(body.category)
    }
  } catch (error: unknown) {
    console.error('Failed to generate presigned upload URL:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate upload URL'
    })
  }
})
