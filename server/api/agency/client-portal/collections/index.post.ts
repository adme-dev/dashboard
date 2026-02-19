/**
 * Create Collection
 * POST /api/agency/client-portal/collections
 */

import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

interface CreateCollectionBody {
  clientId: string
  projectId?: string
  name: string
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
  const user = await requireAuth(event)
  const body = await readBody<CreateCollectionBody>(event)

  const { clientId, name } = body

  if (!clientId || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID and name are required'
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

    // Generate share token if public
    const shareToken = body.isPublic
      ? Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
      : null

    const collection = await queryOne(`
      INSERT INTO deliverable_collections (
        client_id,
        project_id,
        name,
        description,
        cover_image_url,
        collection_type,
        is_public,
        share_token,
        allow_downloads,
        require_approval,
        layout,
        sort_order,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      clientId,
      body.projectId || null,
      name,
      body.description || null,
      body.coverImageUrl || null,
      body.type || 'gallery',
      body.isPublic ?? false,
      shareToken,
      body.allowDownloads ?? true,
      body.requireApproval ?? false,
      body.layout || 'grid',
      body.sortOrder || 'newest',
      user.id
    ])

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
        itemCount: 0,
        createdAt: collection.created_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to create collection:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create collection'
    })
  }
})
