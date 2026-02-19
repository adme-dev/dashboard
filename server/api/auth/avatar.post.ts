/**
 * Upload Avatar
 * POST /api/auth/avatar
 *
 * Accepts multipart form data with an 'avatar' file field.
 * Uses Cloudflare R2 for storage when configured, falls back to base64 in database.
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import {
  isStorageConfigured,
  uploadFile,
  generateStorageKey,
  deleteFile,
  getPublicUrl,
  getPresignedDownloadUrl,
  validateFileType,
  validateFileSize,
  getMaxFileSize,
  getAllowedTypes
} from '~~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // Parse multipart form data
  const formData = await readMultipartFormData(event)

  if (!formData || formData.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file uploaded'
    })
  }

  const avatarFile = formData.find(f => f.name === 'avatar')

  if (!avatarFile) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Avatar file is required'
    })
  }

  const mimeType = avatarFile.type || ''

  // Validate file type
  if (!validateFileType(mimeType, 'avatars')) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid file type. Allowed types: ${getAllowedTypes('avatars').join(', ')}`
    })
  }

  // Validate file size
  if (!validateFileSize(avatarFile.data.length, 'avatars')) {
    const maxSizeMB = Math.round(getMaxFileSize('avatars') / (1024 * 1024))
    throw createError({
      statusCode: 400,
      statusMessage: `File too large. Maximum size is ${maxSizeMB}MB`
    })
  }

  try {
    let avatarUrl: string
    let storageKey: string | null = null

    // Use R2 storage if configured
    if (isStorageConfigured()) {
      // Get current avatar to delete old one
      const currentUser = await queryOne(
        `SELECT avatar_storage_key FROM team_members WHERE id = $1`,
        [user.id]
      )

      // Delete old avatar if exists
      if (currentUser?.avatar_storage_key) {
        try {
          await deleteFile(currentUser.avatar_storage_key)
        } catch (err) {
          console.warn('Failed to delete old avatar:', err)
        }
      }

      // Generate storage key and upload
      storageKey = generateStorageKey('avatars', avatarFile.filename || 'avatar.jpg', user.id)
      const result = await uploadFile(avatarFile.data, storageKey, mimeType, {
        uploadedBy: user.id,
        originalName: avatarFile.filename || 'avatar',
      })

      // Use public URL if available, otherwise presigned
      avatarUrl = getPublicUrl(storageKey) || await getPresignedDownloadUrl(storageKey, 365 * 24 * 60 * 60) // 1 year
    } else {
      // Fallback to base64 for development/simple setups
      const base64 = avatarFile.data.toString('base64')
      avatarUrl = `data:${mimeType};base64,${base64}`
    }

    // Update user's avatar
    const updated = await queryOne(`
      UPDATE team_members
      SET avatar_url = $1, avatar_storage_key = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING avatar_url
    `, [avatarUrl, storageKey, user.id])

    return {
      success: true,
      avatarUrl: updated.avatar_url,
      storageKey
    }
  } catch (error) {
    console.error('Failed to upload avatar:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to upload avatar'
    })
  }
})
