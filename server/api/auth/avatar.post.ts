/**
 * Upload Avatar
 * POST /api/auth/avatar
 *
 * Accepts multipart form data with an 'avatar' file field
 */

import { query, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { randomUUID } from 'crypto'

// For now, we'll store avatars as base64 in the database
// In production, you'd want to use a cloud storage service like S3, Cloudinary, etc.
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

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

  // Validate file type
  const mimeType = avatarFile.type || ''
  if (!ALLOWED_TYPES.includes(mimeType)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid file type. Allowed types: ${ALLOWED_TYPES.join(', ')}`
    })
  }

  // Validate file size
  if (avatarFile.data.length > MAX_FILE_SIZE) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File too large. Maximum size is 2MB'
    })
  }

  try {
    // Convert to base64 data URL for simple storage
    // In production, upload to cloud storage and store the URL
    const base64 = avatarFile.data.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`

    // Update user's avatar
    const updated = await queryOne(`
      UPDATE team_members
      SET avatar_url = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING avatar_url
    `, [dataUrl, user.id])

    return {
      success: true,
      avatarUrl: updated.avatar_url
    }
  } catch (error) {
    console.error('Failed to upload avatar:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to upload avatar'
    })
  }
})
