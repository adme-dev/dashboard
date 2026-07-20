/**
 * Delete File from Storage
 * DELETE /api/storage/:key
 *
 * Deletes a file from R2 storage.
 * The key is passed as a URL parameter.
 */

import { requireWriteAccess } from '~~/server/utils/auth'
import { deleteFile, fileExists, isStorageConfigured } from '~~/server/utils/storage'
import { queryOne } from '~~/server/utils/db'
import { canDeleteStorageObject } from '~~/server/utils/storageAccess'

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)

  if (!isStorageConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'File storage is not configured'
    })
  }

  // The key is URL-encoded and may contain slashes
  const encodedKey = getRouterParam(event, 'key')
  if (!encodedKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Storage key is required'
    })
  }

  let key: string
  try {
    key = decodeURIComponent(encodedKey)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid storage key encoding' })
  }
  if (!key || key.length > 1024 || key.includes('\0')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid storage key' })
  }

  try {
    // Authorise before checking existence so callers cannot probe arbitrary keys.
    const canDelete = await canDeleteStorageObject(key, user.id)
    if (!canDelete) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You do not have permission to delete this file'
      })
    }

    const exists = await fileExists(key)
    if (!exists) {
      throw createError({
        statusCode: 404,
        statusMessage: 'File not found'
      })
    }

    // Delete from R2
    await deleteFile(key)

    // Clean up database references
    await cleanupDatabaseReferences(key)

    return {
      success: true,
      message: 'File deleted successfully'
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to delete file:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete file'
    })
  }
})

/**
 * Remove database references to the deleted file
 */
async function cleanupDatabaseReferences(key: string): Promise<void> {
  // Clean up task attachments
  await queryOne(
    `DELETE FROM task_attachments WHERE storage_key = $1 RETURNING id`,
    [key]
  )

  // Clean up expense receipts
  await queryOne(
    `UPDATE expenses SET receipt_url = NULL, receipt_storage_key = NULL WHERE receipt_storage_key = $1 RETURNING id`,
    [key]
  )

  // Clean up avatars
  await queryOne(
    `UPDATE team_members SET avatar_url = NULL, avatar_storage_key = NULL WHERE avatar_storage_key = $1 RETURNING id`,
    [key]
  )
}
