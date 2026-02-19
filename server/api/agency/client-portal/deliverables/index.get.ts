/**
 * List Client Deliverables (Gallery)
 * GET /api/agency/client-portal/deliverables
 *
 * Query params:
 * - clientId: Filter by client (required for agency view)
 * - projectId: Filter by project
 * - status: Filter by status
 * - type: Filter by deliverable type
 * - featured: Filter featured only
 * - visible: Filter visibility (for agency)
 * - limit: Max results
 * - offset: Pagination offset
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const clientId = query.clientId as string | undefined
  const projectId = query.projectId as string | undefined
  const status = query.status as string | undefined
  const type = query.type as string | undefined
  const featured = query.featured === 'true'
  const visibleOnly = query.visible !== 'false' // default to visible only
  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  try {
    const conditions: string[] = []
    const params: any[] = []
    let idx = 1

    if (clientId) {
      conditions.push(`cd.client_id = $${idx}`)
      params.push(clientId)
      idx++
    }

    if (projectId) {
      conditions.push(`cd.project_id = $${idx}`)
      params.push(projectId)
      idx++
    }

    if (status && status !== 'all') {
      conditions.push(`cd.status = $${idx}`)
      params.push(status)
      idx++
    }

    if (type && type !== 'all') {
      conditions.push(`cd.deliverable_type = $${idx}`)
      params.push(type)
      idx++
    }

    if (featured) {
      conditions.push(`cd.is_featured = true`)
    }

    if (visibleOnly) {
      conditions.push(`cd.is_visible_to_client = true`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    params.push(limit)
    params.push(offset)

    const deliverables = await queryRows(`
      SELECT
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
        cd.tags,
        cd.status,
        cd.is_featured,
        cd.is_final,
        cd.version,
        cd.is_visible_to_client,
        cd.published_at,
        cd.approved_at,
        cd.view_count,
        cd.download_count,
        cd.created_at,
        cd.updated_at,
        p.id as project_id,
        p.name as project_name,
        c.id as client_id,
        c.name as client_name,
        creator.name as created_by_name,
        approver.name as approved_by_name
      FROM client_deliverables cd
      JOIN agency_clients c ON cd.client_id = c.id
      LEFT JOIN projects p ON cd.project_id = p.id
      LEFT JOIN team_members creator ON cd.created_by = creator.id
      LEFT JOIN client_users approver ON cd.approved_by = approver.id
      ${whereClause}
      ORDER BY cd.is_featured DESC, cd.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, params)

    // Get total count
    const countParams = params.slice(0, -2)
    const total = await queryOne(`
      SELECT COUNT(*) as count
      FROM client_deliverables cd
      ${whereClause}
    `, countParams)

    // Get summary stats
    const summary = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
        COUNT(CASE WHEN status = 'pending_review' THEN 1 END) as pending_review,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN is_featured THEN 1 END) as featured,
        COUNT(CASE WHEN is_visible_to_client THEN 1 END) as visible
      FROM client_deliverables cd
      ${whereClause}
    `, countParams)

    return {
      deliverables: deliverables.map(d => ({
        id: d.id,
        title: d.title,
        description: d.description,
        type: d.deliverable_type,
        fileUrl: d.file_url,
        fileName: d.file_name,
        fileType: d.file_type,
        fileSize: d.file_size,
        thumbnailUrl: d.thumbnail_url,
        previewUrl: d.preview_url,
        metadata: d.metadata,
        tags: d.tags,
        status: d.status,
        isFeatured: d.is_featured,
        isFinal: d.is_final,
        version: d.version,
        isVisible: d.is_visible_to_client,
        publishedAt: d.published_at,
        approvedAt: d.approved_at,
        viewCount: d.view_count,
        downloadCount: d.download_count,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        projectId: d.project_id,
        projectName: d.project_name,
        clientId: d.client_id,
        clientName: d.client_name,
        createdByName: d.created_by_name,
        approvedByName: d.approved_by_name
      })),
      pagination: {
        total: Number(total?.count || 0),
        limit,
        offset,
        hasMore: offset + deliverables.length < Number(total?.count || 0)
      },
      summary: {
        total: Number(summary?.total || 0),
        draft: Number(summary?.draft || 0),
        pendingReview: Number(summary?.pending_review || 0),
        approved: Number(summary?.approved || 0),
        featured: Number(summary?.featured || 0),
        visible: Number(summary?.visible || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch deliverables:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch deliverables'
    })
  }
})
