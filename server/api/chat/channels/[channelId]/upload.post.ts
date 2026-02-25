/**
 * POST /api/chat/channels/:channelId/upload
 * Get a presigned URL for uploading a file attachment to R2.
 * Body: { fileName, contentType, fileSize }
 * Returns: { uploadUrl, key, downloadUrl }
 */
import { queryOne } from '~~/server/utils/db'
import {
  validateFileType,
  validateFileSize,
  generateStorageKey,
  getPresignedUploadUrl,
  getPublicUrl,
  getPresignedDownloadUrl,
  isStorageConfigured
} from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const channelId = getRouterParam(event, 'channelId')

  if (!channelId) {
    throw createError({ statusCode: 400, statusMessage: 'Channel ID required' })
  }

  if (!isStorageConfigured()) {
    throw createError({ statusCode: 503, statusMessage: 'File storage not configured' })
  }

  // Verify membership
  const membership = await queryOne(`
    SELECT role FROM chat_channel_members
    WHERE channel_id = $1 AND user_id = $2
  `, [channelId, user.id])

  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this channel' })
  }

  const body = await readBody(event)
  const { fileName, contentType, fileSize } = body

  if (!fileName || !contentType || !fileSize) {
    throw createError({ statusCode: 400, statusMessage: 'fileName, contentType, and fileSize required' })
  }

  // Validate file type and size
  if (!validateFileType(contentType, 'attachments')) {
    throw createError({ statusCode: 400, statusMessage: 'File type not allowed' })
  }

  if (!validateFileSize(fileSize, 'attachments')) {
    throw createError({ statusCode: 400, statusMessage: 'File too large (max 50MB)' })
  }

  // Generate storage key
  const key = generateStorageKey('attachments', fileName, `chat/${channelId}`)

  // Get presigned upload URL (client uploads directly to R2)
  const uploadUrl = await getPresignedUploadUrl(key, contentType, 600) // 10 min expiry

  // Generate download URL
  const downloadUrl = getPublicUrl(key) || await getPresignedDownloadUrl(key, 7 * 24 * 60 * 60) // 7 days

  return {
    uploadUrl,
    key,
    downloadUrl,
    fileName,
    contentType,
    fileSize
  }
})
