/**
 * List Deliverable Collections
 * GET /api/agency/client-portal/collections
 *
 * Query params:
 * - clientId: Filter by client
 * - projectId: Filter by project
 * - type: Filter by collection type
 * - limit: Max results
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const clientId = query.clientId as string | undefined
  const projectId = query.projectId as string | undefined
  const type = query.type as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (clientId) {
      conditions.push(`dc.client_id = $${idx}`)
      params.push(clientId)
      idx++
    }

    if (projectId) {
      conditions.push(`dc.project_id = $${idx}`)
      params.push(projectId)
      idx++
    }

    if (type && type !== 'all') {
      conditions.push(`dc.collection_type = $${idx}`)
      params.push(type)
      idx++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit)

    const collections = await queryRows(`
      SELECT
        dc.id,
        dc.name,
        dc.description,
        dc.cover_image_url,
        dc.collection_type,
        dc.is_public,
        dc.share_token,
        dc.share_expires_at,
        dc.allow_downloads,
        dc.require_approval,
        dc.layout,
        dc.sort_order,
        dc.item_count,
        dc.view_count,
        dc.last_updated_at,
        dc.created_at,
        p.id as project_id,
        p.name as project_name,
        c.id as client_id,
        c.name as client_name,
        creator.name as created_by_name
      FROM deliverable_collections dc
      JOIN agency_clients c ON dc.client_id = c.id
      LEFT JOIN projects p ON dc.project_id = p.id
      LEFT JOIN team_members creator ON dc.created_by = creator.id
      ${whereClause}
      ORDER BY dc.created_at DESC
      LIMIT $${idx}
    `, params)

    return {
      collections: collections.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        coverImageUrl: c.cover_image_url,
        type: c.collection_type,
        isPublic: c.is_public,
        shareToken: c.share_token,
        shareExpiresAt: c.share_expires_at,
        allowDownloads: c.allow_downloads,
        requireApproval: c.require_approval,
        layout: c.layout,
        sortOrder: c.sort_order,
        itemCount: c.item_count,
        viewCount: c.view_count,
        lastUpdatedAt: c.last_updated_at,
        createdAt: c.created_at,
        projectId: c.project_id,
        projectName: c.project_name,
        clientId: c.client_id,
        clientName: c.client_name,
        createdByName: c.created_by_name
      }))
    }
  } catch (error) {
    console.error('Failed to fetch collections:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch collections'
    })
  }
})
