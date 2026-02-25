/**
 * Client Portal - List Deliverables (Gallery)
 * GET /api/portal/deliverables
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  const query = getQuery(event)

  const projectId = query.projectId as string | undefined
  const status = query.status as string | undefined
  const type = query.type as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0

  try {
    const conditions: string[] = ['cd.client_id = $1', 'cd.is_visible_to_client = true']
    const params: any[] = [clientUser.clientId]
    let idx = 2

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

    const whereClause = `WHERE ${conditions.join(' AND ')}`
    params.push(limit)
    params.push(offset)

    const deliverables = await queryRows(`
      SELECT
        cd.id, cd.title, cd.description, cd.deliverable_type,
        cd.file_url, cd.file_name, cd.file_type, cd.file_size,
        cd.thumbnail_url, cd.preview_url, cd.metadata, cd.tags,
        cd.status, cd.is_featured, cd.is_final, cd.version,
        cd.published_at, cd.approved_at, cd.view_count, cd.download_count,
        cd.created_at, cd.updated_at,
        p.id as project_id, p.name as project_name,
        creator.name as created_by_name
      FROM client_deliverables cd
      LEFT JOIN projects p ON cd.project_id = p.id
      LEFT JOIN team_members creator ON cd.created_by = creator.id
      ${whereClause}
      ORDER BY cd.is_featured DESC, cd.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, params)

    const countParams = params.slice(0, -2)
    const total = await queryOne(`
      SELECT COUNT(*) as count FROM client_deliverables cd ${whereClause}
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
        publishedAt: d.published_at,
        approvedAt: d.approved_at,
        viewCount: d.view_count,
        downloadCount: d.download_count,
        createdAt: d.created_at,
        projectId: d.project_id,
        projectName: d.project_name,
        createdByName: d.created_by_name
      })),
      pagination: {
        total: Number(total?.count || 0),
        limit,
        offset,
        hasMore: offset + deliverables.length < Number(total?.count || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch deliverables:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch deliverables' })
  }
})
