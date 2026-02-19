/**
 * Delete Client File
 * DELETE /api/agency/client-portal/files/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const fileId = getRouterParam(event, 'id')

  if (!fileId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File ID is required'
    })
  }

  try {
    const existing = await queryOne(`
      SELECT id, name FROM client_files WHERE id = $1
    `, [fileId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'File not found'
      })
    }

    await queryOne(`
      DELETE FROM client_files WHERE id = $1 RETURNING id
    `, [fileId])

    return {
      success: true,
      message: `File "${existing.name}" deleted successfully`
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
