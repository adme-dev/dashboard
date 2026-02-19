/**
 * Delete File from Storage
 * DELETE /api/storage/:key
 *
 * Deletes a file from R2 storage.
 * The key is passed as a URL parameter.
 */

import { requireAuth } from '~~/server/utils/auth'
import { deleteFile, fileExists, isStorageConfigured } from '~~/server/utils/storage'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

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

  // Decode the key (it's passed as a single param but may contain path segments)
  const key = decodeURIComponent(encodedKey)

  try {
    // Verify file exists
    const exists = await fileExists(key)
    if (!exists) {
      throw createError({
        statusCode: 404,
        statusMessage: 'File not found'
      })
    }

    // Check ownership/permissions based on the file category
    const canDelete = await checkDeletePermission(key, user.id)
    if (!canDelete) {
      throw createError({
        statusCode: 403,
        statusMessage: 'You do not have permission to delete this file'
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
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to delete file:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to delete file'
    })
  }
})

/**
 * Check if user has permission to delete the file
 */
async function checkDeletePermission(key: string, userId: string): Promise<boolean> {
  // Avatars: Only the owner can delete
  if (key.startsWith('avatars/')) {
    const result = await queryOne(
      `SELECT id FROM team_members WHERE avatar_storage_key = $1 AND id = $2`,
      [key, userId]
    )
    return !!result
  }

  // Task attachments: Uploader or task assignee/reporter can delete
  if (key.startsWith('attachments/')) {
    const result = await queryOne(`
      SELECT ta.id
      FROM task_attachments ta
      JOIN tasks t ON ta.task_id = t.id
      WHERE ta.storage_key = $1
        AND (ta.uploaded_by = $2 OR t.assignee_id = $2 OR t.reporter_id = $2)
    `, [key, userId])
    return !!result
  }

  // Expenses: Only the submitter can delete
  if (key.startsWith('expenses/')) {
    const result = await queryOne(
      `SELECT id FROM expenses WHERE receipt_storage_key = $1 AND submitted_by = $2`,
      [key, userId]
    )
    return !!result
  }

  // Default: Allow deletion (could be made more restrictive)
  return true
}

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
