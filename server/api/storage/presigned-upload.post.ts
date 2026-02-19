/**
 * Generate Presigned Upload URL
 * POST /api/storage/presigned-upload
 *
 * Generates a presigned URL for direct client-to-R2 file uploads.
 * This is more efficient than uploading through the server.
 */

import { requireAuth } from '~~/server/utils/auth'
import {
  generateStorageKey,
  getPresignedUploadUrl,
  validateFileType,
  validateFileSize,
  getMaxFileSize,
  getAllowedTypes,
  isStorageConfigured,
  type FileCategory
} from '~~/server/utils/storage'

interface PresignedUploadRequest {
  fileName: string
  fileType: string
  fileSize: number
  category: FileCategory
  entityId?: string // Optional: task ID, expense ID, etc.
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<PresignedUploadRequest>(event)

  // Check if storage is configured
  if (!isStorageConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'File storage is not configured. Please contact administrator.'
    })
  }

  // Validate request
  if (!body.fileName?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File name is required'
    })
  }

  if (!body.fileType?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File type (MIME type) is required'
    })
  }

  if (!body.fileSize || body.fileSize <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File size is required and must be greater than 0'
    })
  }

  const validCategories: FileCategory[] = ['avatars', 'attachments', 'expenses', 'briefs', 'invoices', 'general']
  if (!body.category || !validCategories.includes(body.category)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid category. Must be one of: ${validCategories.join(', ')}`
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

  try {
    // Generate storage key
    const key = generateStorageKey(body.category, body.fileName, body.entityId)

    // Generate presigned upload URL (valid for 1 hour)
    const uploadUrl = await getPresignedUploadUrl(key, body.fileType, 3600)

    return {
      success: true,
      uploadUrl,
      key,
      expiresIn: 3600,
      maxSize: getMaxFileSize(body.category),
      allowedTypes: getAllowedTypes(body.category)
    }
  } catch (error: any) {
    console.error('Failed to generate presigned upload URL:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate upload URL'
    })
  }
})
