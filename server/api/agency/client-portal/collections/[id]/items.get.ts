/**
 * Get Collection Items
 * GET /api/agency/client-portal/collections/:id/items
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const collectionId = getRouterParam(event, 'id')

  if (!collectionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Collection ID is required'
    })
  }

  try {
    // Get collection details
    const collection = await queryOne(`
      SELECT
        dc.id,
        dc.name,
        dc.description,
        dc.cover_image_url,
        dc.collection_type,
        dc.layout,
        dc.sort_order as default_sort,
        dc.item_count,
        dc.is_public,
        dc.allow_downloads,
        c.id as client_id,
        c.name as client_name,
        p.id as project_id,
        p.name as project_name
      FROM deliverable_collections dc
      JOIN agency_clients c ON dc.client_id = c.id
      LEFT JOIN projects p ON dc.project_id = p.id
      WHERE dc.id = $1
    `, [collectionId])

    if (!collection) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Collection not found'
      })
    }

    // Determine sort order
    let orderBy = 'ci.sort_order ASC'
    if (collection.default_sort === 'newest') {
      orderBy = 'cd.created_at DESC'
    } else if (collection.default_sort === 'oldest') {
      orderBy = 'cd.created_at ASC'
    } else if (collection.default_sort === 'name') {
      orderBy = 'cd.title ASC'
    }

    // Get items
    const items = await queryRows(`
      SELECT
        ci.id as item_id,
        ci.sort_order,
        ci.added_at,
        cd.id,
        cd.title,
        cd.description,
        cd.deliverable_type,
        cd.file_url,
        cd.file_name,
        cd.file_type,
        cd.file_size,
        cd.thumbnail_url,
        cd.preview_url,
        cd.metadata,
        cd.status,
        cd.is_featured,
        cd.is_final,
        cd.view_count,
        cd.download_count,
        cd.created_at
      FROM collection_items ci
      JOIN client_deliverables cd ON ci.deliverable_id = cd.id
      WHERE ci.collection_id = $1
        AND cd.is_visible_to_client = true
      ORDER BY ${orderBy}
    `, [collectionId])

    return {
      collection: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        coverImageUrl: collection.cover_image_url,
        type: collection.collection_type,
        layout: collection.layout,
        defaultSort: collection.default_sort,
        itemCount: collection.item_count,
        isPublic: collection.is_public,
        allowDownloads: collection.allow_downloads,
        clientId: collection.client_id,
        clientName: collection.client_name,
        projectId: collection.project_id,
        projectName: collection.project_name
      },
      items: items.map(i => ({
        itemId: i.item_id,
        sortOrder: i.sort_order,
        addedAt: i.added_at,
        deliverable: {
          id: i.id,
          title: i.title,
          description: i.description,
          type: i.deliverable_type,
          fileUrl: i.file_url,
          fileName: i.file_name,
          fileType: i.file_type,
          fileSize: i.file_size,
          thumbnailUrl: i.thumbnail_url,
          previewUrl: i.preview_url,
          metadata: i.metadata,
          status: i.status,
          isFeatured: i.is_featured,
          isFinal: i.is_final,
          viewCount: i.view_count,
          downloadCount: i.download_count,
          createdAt: i.created_at
        }
      }))
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch collection items:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch collection items'
    })
  }
})
