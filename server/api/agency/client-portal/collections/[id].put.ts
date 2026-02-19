/**
 * Update Collection
 * PUT /api/agency/client-portal/collections/:id
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface UpdateCollectionBody {
  name?: string
  description?: string
  coverImageUrl?: string
  type?: 'gallery' | 'album' | 'portfolio' | 'archive' | 'deliverables'
  isPublic?: boolean
  allowDownloads?: boolean
  requireApproval?: boolean
  layout?: 'grid' | 'masonry' | 'list' | 'carousel'
  sortOrder?: 'newest' | 'oldest' | 'name' | 'custom'
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const collectionId = getRouterParam(event, 'id')

  if (!collectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
    })
  }

  const body = await readBody<UpdateCollectionBody>(event)

  try {
    // Check collection exists
    const existing = await queryOne(`
      SELECT id, is_public, share_token FROM deliverable_collections WHERE id = $1
    `, [collectionId])

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Collection not found'
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

    if (body.coverImageUrl !== undefined) {
      updates.push(`cover_image_url = $${idx++}`)
      params.push(body.coverImageUrl)
    }

    if (body.type !== undefined) {
      updates.push(`collection_type = $${idx++}`)
      params.push(body.type)
    }

    if (body.isPublic !== undefined) {
      updates.push(`is_public = $${idx++}`)
      params.push(body.isPublic)

      // Generate share token when making public
      if (body.isPublic && !existing.is_public && !existing.share_token) {
        const shareToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
        updates.push(`share_token = $${idx++}`)
        params.push(shareToken)
      }
    }

    if (body.allowDownloads !== undefined) {
      updates.push(`allow_downloads = $${idx++}`)
      params.push(body.allowDownloads)
    }

    if (body.requireApproval !== undefined) {
      updates.push(`require_approval = $${idx++}`)
      params.push(body.requireApproval)
    }

    if (body.layout !== undefined) {
      updates.push(`layout = $${idx++}`)
      params.push(body.layout)
    }

    if (body.sortOrder !== undefined) {
      updates.push(`sort_order = $${idx++}`)
      params.push(body.sortOrder)
    }

    if (updates.length === 0) {
      return {
        success: true,
        message: 'No changes provided'
      }
    }

    updates.push('updated_at = NOW()')
    params.push(collectionId)

    const collection = await queryOne(`
      UPDATE deliverable_collections
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, params)

    return {
      success: true,
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        coverImageUrl: collection.cover_image_url,
        type: collection.collection_type,
        isPublic: collection.is_public,
        shareToken: collection.share_token,
        shareUrl: collection.share_token ? `/gallery/${collection.share_token}` : null,
        allowDownloads: collection.allow_downloads,
        requireApproval: collection.require_approval,
        layout: collection.layout,
        sortOrder: collection.sort_order,
        updatedAt: collection.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to update collection:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update collection'
    })
  }
})
