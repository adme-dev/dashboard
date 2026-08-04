/**
 * Delete File from Storage
 * DELETE /api/storage/:key
 *
 * Deletes a file from R2 storage.
 * The key is passed as a URL parameter.
 */

import { requireWriteAccess } from '~~/server/utils/auth'
import { prepareKnowledgeSourceDeletion } from '~~/server/utils/boardKnowledge/deletion'
import { deleteFile, fileExists, isStorageConfigured } from '~~/server/utils/storage'
import { queryRows, transaction } from '~~/server/utils/db'
import { canDeleteStorageObject } from '~~/server/utils/storageAccess'

interface KnowledgeStorageReference {
  source_type: 'board_file' | 'task_attachment'
  source_id: string
  department_id: string
}

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

    const knowledgeReferences = await queryRows<KnowledgeStorageReference>(`
      SELECT 'board_file'::text AS source_type, bf.id AS source_id, bf.department_id
      FROM board_files bf
      WHERE bf.storage_key = $1
      UNION ALL
      SELECT 'task_attachment'::text AS source_type, ta.id AS source_id, t.department_id
      FROM task_attachments ta
      JOIN tasks t ON t.id = ta.task_id
      WHERE ta.storage_key = $1
    `, [key])

    for (const reference of knowledgeReferences) {
      await prepareKnowledgeSourceDeletion(event, {
        departmentId: reference.department_id,
        sourceType: reference.source_type,
        sourceId: reference.source_id,
        actorId: user.id
      })
    }

    // Clean up database references
    await cleanupDatabaseReferences(key)

    // Storage is removed only after governance and database state are durable.
    await deleteFile(key)

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
  await transaction(async (client) => {
    // Clean up board files
    await client.query(
      `DELETE FROM board_files WHERE storage_key = $1 RETURNING id`,
      [key]
    )

    // Clean up task attachments
    await client.query(
      `DELETE FROM task_attachments WHERE storage_key = $1 RETURNING id`,
      [key]
    )

    // Clean up expense receipts
    await client.query(
      `UPDATE expenses SET receipt_url = NULL, receipt_storage_key = NULL WHERE receipt_storage_key = $1 RETURNING id`,
      [key]
    )

    // Clean up avatars
    await client.query(
      `UPDATE team_members SET avatar_url = NULL, avatar_storage_key = NULL WHERE avatar_storage_key = $1 RETURNING id`,
      [key]
    )
  })
}
