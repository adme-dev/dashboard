/**
 * Get Single Collection
 * GET /api/agency/client-portal/collections/:id
 */

import { queryOne, queryRows } from '~~/server/utils/db'
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
    const collection = await queryOne(`
      SELECT
        dc.*,
        ac.name as client_name,
        p.name as project_name,
        tm.name as created_by_name,
        (SELECT COUNT(*) FROM collection_deliverables WHERE collection_id = dc.id) as item_count
      FROM deliverable_collections dc
      LEFT JOIN agency_clients ac ON dc.client_id = ac.id
      LEFT JOIN projects p ON dc.project_id = p.id
      LEFT JOIN team_members tm ON dc.created_by = tm.id
      WHERE dc.id = $1
    `, [collectionId])

    if (!collection) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Collection not found'
      })
    }

    return {
      collection: {
        id: collection.id,
        clientId: collection.client_id,
        clientName: collection.client_name,
        projectId: collection.project_id,
        projectName: collection.project_name,
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
        itemCount: Number(collection.item_count),
        createdBy: collection.created_by,
        createdByName: collection.created_by_name,
        createdAt: collection.created_at,
        updatedAt: collection.updated_at
      }
    }
  } catch (error: any) {
    if (error.statusCode) throw error
    console.error('Failed to fetch collection:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch collection'
    })
  }
})
