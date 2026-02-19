/**
 * Update Client File
 * PUT /api/agency/client-portal/files/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateFileBody {
  name?: string
  description?: string
  category?: 'deliverable' | 'asset' | 'document' | 'reference'
  isVisible?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const fileId = getRouterParam(event, 'id')

  if (!fileId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File ID is required'
    })
  }

  const body = await readBody<UpdateFileBody>(event)

  try {
    // Check file exists
    const existing = await queryOne(`
      SELECT id, name, is_visible FROM client_files WHERE id = $1
    `, [fileId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'File not found'
      })
    }

    // Build update query
    const updates: string[] = []
    const params: any[] = []
    let idx = 1

    if (body.name !== undefined) {
      updates.push(`name = $${idx++}`)
      params.push(body.name)
    }

    if (body.description !== undefined) {
      updates.push(`description = $${idx++}`)
      params.push(body.description)
    }

    if (body.category !== undefined) {
      updates.push(`category = $${idx++}`)
      params.push(body.category)
    }

    if (body.isVisible !== undefined) {
      updates.push(`is_visible = $${idx++}`)
      params.push(body.isVisible)

      // Update shared_at and shared_by when making visible
      if (body.isVisible && !existing.is_visible) {
        updates.push(`shared_at = NOW()`)
        updates.push(`shared_by = $${idx++}`)
        params.push(user.id)
      }
    }

    if (updates.length === 0) {
      return {
        success: true,
        message: 'No changes provided',
        file: existing
      }
    }

    updates.push('updated_at = NOW()')
    params.push(fileId)

    const file = await queryOne(`
      UPDATE client_files
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, params)

    return {
      success: true,
      file: {
        id: file.id,
        clientId: file.client_id,
        projectId: file.project_id,
        name: file.name,
        description: file.description,
        fileUrl: file.file_url,
        fileType: file.file_type,
        fileSize: file.file_size,
        thumbnailUrl: file.thumbnail_url,
        category: file.category,
        isVisible: file.is_visible,
        sharedAt: file.shared_at,
        sharedBy: file.shared_by,
        createdAt: file.created_at,
        updatedAt: file.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update file:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update file'
    })
  }
})
