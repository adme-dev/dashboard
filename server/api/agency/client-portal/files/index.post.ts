/**
 * Create/Share Client File
 * POST /api/agency/client-portal/files
 *
 * Body:
 * - clientId: Client ID (required)
 * - projectId: Optional project ID
 * - name: File name (required)
 * - description: Optional description
 * - fileUrl: URL to file (required)
 * - fileType: MIME type
 * - fileSize: Size in bytes
 * - thumbnailUrl: Optional thumbnail
 * - category: deliverable, asset, document, reference
 * - isVisible: Whether visible to client (default true)
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CreateFileBody {
  clientId: string
  projectId?: string
  name: string
  description?: string
  fileUrl: string
  fileType?: string
  fileSize?: number
  thumbnailUrl?: string
  category?: 'deliverable' | 'asset' | 'document' | 'reference'
  isVisible?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateFileBody>(event)

  const { clientId, name, fileUrl } = body

  if (!clientId || !name || !fileUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID, name, and file URL are required'
    })
  }

  try {
    // Verify client exists
    const client = await queryOne(`
      SELECT id FROM agency_clients WHERE id = $1
    `, [clientId])

    if (!client) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    }

    // Verify project if provided
    if (body.projectId) {
      const project = await queryOne(`
        SELECT id FROM projects WHERE id = $1 AND client_id = $2
      `, [body.projectId, clientId])

      if (!project) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Project not found or does not belong to this client'
        })
      }
    }

    const isVisible = body.isVisible ?? true

    const file = await queryOne(`
      INSERT INTO client_files (
        client_id,
        project_id,
        name,
        description,
        file_url,
        file_type,
        file_size,
        thumbnail_url,
        category,
        is_visible_to_client,
        shared_at,
        shared_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      clientId,
      body.projectId || null,
      name,
      body.description || null,
      fileUrl,
      body.fileType || null,
      body.fileSize || null,
      body.thumbnailUrl || null,
      body.category || null,
      isVisible,
      isVisible ? new Date().toISOString() : null,
      isVisible ? user.id : null
    ])

    return {
      success: true,
      file: {
        id: file.id,
        name: file.name,
        description: file.description,
        fileUrl: file.file_url,
        fileType: file.file_type,
        fileSize: file.file_size,
        thumbnailUrl: file.thumbnail_url,
        category: file.category,
        isVisible: file.is_visible_to_client,
        sharedAt: file.shared_at,
        version: file.version,
        createdAt: file.created_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create file:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create file'
    })
  }
})
