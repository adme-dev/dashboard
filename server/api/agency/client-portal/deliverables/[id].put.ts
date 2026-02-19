/**
 * Update Deliverable
 * PUT /api/agency/client-portal/deliverables/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateDeliverableBody {
  title?: string
  description?: string
  type?: 'file' | 'link' | 'video' | 'image' | 'document' | 'design' | 'code' | 'other'
  fileUrl?: string
  fileName?: string
  fileType?: string
  fileSize?: number
  thumbnailUrl?: string
  previewUrl?: string
  metadata?: Record<string, any>
  tags?: string[]
  status?: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived'
  isVisible?: boolean
  isFeatured?: boolean
  isFinal?: boolean
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const deliverableId = getRouterParam(event, 'id')
  const body = await readBody<UpdateDeliverableBody>(event)

  if (!deliverableId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Deliverable ID is required'
    })
  }

  try {
    // Check deliverable exists
    const existing = await queryOne(`
      SELECT id, is_visible_to_client, status FROM client_deliverables WHERE id = $1
    `, [deliverableId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Deliverable not found'
      })
    }

    // Build dynamic update
    const fields: string[] = []
    const values: any[] = []
    let idx = 1

    if (body.title !== undefined) {
      fields.push(`title = $${idx}`)
      values.push(body.title)
      idx++
    }

    if (body.description !== undefined) {
      fields.push(`description = $${idx}`)
      values.push(body.description)
      idx++
    }

    if (body.type !== undefined) {
      fields.push(`deliverable_type = $${idx}`)
      values.push(body.type)
      idx++
    }

    if (body.fileUrl !== undefined) {
      fields.push(`file_url = $${idx}`)
      values.push(body.fileUrl)
      idx++
    }

    if (body.fileName !== undefined) {
      fields.push(`file_name = $${idx}`)
      values.push(body.fileName)
      idx++
    }

    if (body.fileType !== undefined) {
      fields.push(`file_type = $${idx}`)
      values.push(body.fileType)
      idx++
    }

    if (body.fileSize !== undefined) {
      fields.push(`file_size = $${idx}`)
      values.push(body.fileSize)
      idx++
    }

    if (body.thumbnailUrl !== undefined) {
      fields.push(`thumbnail_url = $${idx}`)
      values.push(body.thumbnailUrl)
      idx++
    }

    if (body.previewUrl !== undefined) {
      fields.push(`preview_url = $${idx}`)
      values.push(body.previewUrl)
      idx++
    }

    if (body.metadata !== undefined) {
      fields.push(`metadata = $${idx}`)
      values.push(JSON.stringify(body.metadata))
      idx++
    }

    if (body.tags !== undefined) {
      fields.push(`tags = $${idx}`)
      values.push(body.tags)
      idx++
    }

    if (body.status !== undefined) {
      fields.push(`status = $${idx}`)
      values.push(body.status)
      idx++
    }

    if (body.isFeatured !== undefined) {
      fields.push(`is_featured = $${idx}`)
      values.push(body.isFeatured)
      idx++
    }

    if (body.isFinal !== undefined) {
      fields.push(`is_final = $${idx}`)
      values.push(body.isFinal)
      idx++
    }

    // Handle visibility change (track published_at)
    if (body.isVisible !== undefined) {
      fields.push(`is_visible_to_client = $${idx}`)
      values.push(body.isVisible)
      idx++

      if (body.isVisible && !existing.is_visible_to_client) {
        fields.push(`published_at = NOW()`)
        fields.push(`published_by = $${idx}`)
        values.push(user.id)
        idx++
      }
    }

    if (fields.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No fields to update'
      })
    }

    values.push(deliverableId)

    const deliverable = await queryOne(`
      UPDATE client_deliverables
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING *
    `, values)

    return {
      success: true,
      deliverable: {
        id: deliverable.id,
        title: deliverable.title,
        description: deliverable.description,
        type: deliverable.deliverable_type,
        fileUrl: deliverable.file_url,
        fileName: deliverable.file_name,
        status: deliverable.status,
        isVisible: deliverable.is_visible_to_client,
        isFeatured: deliverable.is_featured,
        isFinal: deliverable.is_final,
        publishedAt: deliverable.published_at,
        updatedAt: deliverable.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update deliverable:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update deliverable'
    })
  }
})
