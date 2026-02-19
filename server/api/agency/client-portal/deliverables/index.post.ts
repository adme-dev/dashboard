/**
 * Create Deliverable
 * POST /api/agency/client-portal/deliverables
 *
 * Body:
 * - clientId: Client ID
 * - projectId: Optional project ID
 * - taskId: Optional task ID
 * - title: Deliverable title
 * - description: Optional description
 * - type: Deliverable type
 * - fileUrl: URL to the file
 * - fileName: Original file name
 * - fileType: MIME type
 * - fileSize: Size in bytes
 * - thumbnailUrl: Optional thumbnail
 * - previewUrl: Optional preview
 * - metadata: Optional metadata
 * - tags: Optional tags array
 * - isVisible: Whether visible to client (default false)
 * - isFeatured: Whether featured (default false)
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CreateDeliverableBody {
  clientId: string
  projectId?: string
  taskId?: string
  title: string
  description?: string
  type?: 'file' | 'link' | 'video' | 'image' | 'document' | 'design' | 'code' | 'other'
  fileUrl: string
  fileName?: string
  fileType?: string
  fileSize?: number
  thumbnailUrl?: string
  previewUrl?: string
  metadata?: Record<string, any>
  tags?: string[]
  isVisible?: boolean
  isFeatured?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<CreateDeliverableBody>(event)

  const { clientId, title, fileUrl } = body

  if (!clientId || !title || !fileUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID, title, and file URL are required'
    })
  }

  try {
    // Verify client exists
    const client = await queryOne(`
      SELECT id, name FROM agency_clients WHERE id = $1
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

    const deliverable = await queryOne(`
      INSERT INTO client_deliverables (
        client_id,
        project_id,
        task_id,
        title,
        description,
        deliverable_type,
        file_url,
        file_name,
        file_type,
        file_size,
        thumbnail_url,
        preview_url,
        metadata,
        tags,
        is_visible_to_client,
        is_featured,
        published_at,
        published_by,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        CASE WHEN $15 = true THEN NOW() ELSE NULL END,
        CASE WHEN $15 = true THEN $17 ELSE NULL END,
        $17
      )
      RETURNING *
    `, [
      clientId,
      body.projectId || null,
      body.taskId || null,
      title,
      body.description || null,
      body.type || 'file',
      fileUrl,
      body.fileName || null,
      body.fileType || null,
      body.fileSize || null,
      body.thumbnailUrl || null,
      body.previewUrl || null,
      JSON.stringify(body.metadata || {}),
      body.tags || [],
      body.isVisible ?? false,
      body.isFeatured ?? false,
      user.id
    ])

    return {
      success: true,
      deliverable: {
        id: deliverable.id,
        title: deliverable.title,
        description: deliverable.description,
        type: deliverable.deliverable_type,
        fileUrl: deliverable.file_url,
        fileName: deliverable.file_name,
        fileType: deliverable.file_type,
        fileSize: deliverable.file_size,
        thumbnailUrl: deliverable.thumbnail_url,
        previewUrl: deliverable.preview_url,
        metadata: deliverable.metadata,
        tags: deliverable.tags,
        status: deliverable.status,
        isVisible: deliverable.is_visible_to_client,
        isFeatured: deliverable.is_featured,
        version: deliverable.version,
        createdAt: deliverable.created_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create deliverable:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create deliverable'
    })
  }
})
