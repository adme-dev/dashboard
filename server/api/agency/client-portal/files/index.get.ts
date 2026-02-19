/**
 * List Client Files
 * GET /api/agency/client-portal/files
 *
 * Query params:
 * - clientId: Filter by client (required)
 * - projectId: Filter by project
 * - category: Filter by category (deliverable, asset, document, reference)
 * - visibleOnly: Only visible to client files (default true)
 * - limit: Max results
 */

import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const clientId = query.clientId as string
  const projectId = query.projectId as string | undefined
  const category = query.category as string | undefined
  const visibleOnly = query.visibleOnly !== 'false'
  const limit = Math.min(Number(query.limit) || 50, 100)

  if (!clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Client ID is required'
    })
  }

  try {
    const conditions: string[] = ['cf.client_id = $1']
    const params: any[] = [clientId]
    let idx = 2

    if (projectId) {
      conditions.push(`cf.project_id = $${idx}`)
      params.push(projectId)
      idx++
    }

    if (category && category !== 'all') {
      conditions.push(`cf.category = $${idx}`)
      params.push(category)
      idx++
    }

    if (visibleOnly) {
      conditions.push('cf.is_visible_to_client = true')
    }

    params.push(limit)

    const files = await queryRows(`
      SELECT
        cf.id,
        cf.name,
        cf.description,
        cf.file_url,
        cf.file_type,
        cf.file_size,
        cf.thumbnail_url,
        cf.category,
        cf.is_visible_to_client,
        cf.shared_at,
        cf.download_count,
        cf.last_downloaded_at,
        cf.version,
        cf.created_at,
        cf.updated_at,
        p.id as project_id,
        p.name as project_name,
        sharer.name as shared_by_name,
        downloader.name as last_downloaded_by_name
      FROM client_files cf
      LEFT JOIN projects p ON cf.project_id = p.id
      LEFT JOIN team_members sharer ON cf.shared_by = sharer.id
      LEFT JOIN client_users downloader ON cf.last_downloaded_by = downloader.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY cf.shared_at DESC NULLS LAST, cf.created_at DESC
      LIMIT $${idx}
    `, params)

    // Get summary stats
    const summary = await queryOne(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN category = 'deliverable' THEN 1 END) as deliverables,
        COUNT(CASE WHEN category = 'asset' THEN 1 END) as assets,
        COUNT(CASE WHEN category = 'document' THEN 1 END) as documents,
        COUNT(CASE WHEN category = 'reference' THEN 1 END) as references,
        COALESCE(SUM(file_size), 0) as total_size,
        COALESCE(SUM(download_count), 0) as total_downloads
      FROM client_files
      WHERE client_id = $1 ${visibleOnly ? 'AND is_visible_to_client = true' : ''}
    `, [clientId])

    return {
      files: files.map(f => ({
        id: f.id,
        name: f.name,
        description: f.description,
        fileUrl: f.file_url,
        fileType: f.file_type,
        fileSize: f.file_size,
        thumbnailUrl: f.thumbnail_url,
        category: f.category,
        isVisible: f.is_visible_to_client,
        sharedAt: f.shared_at,
        downloadCount: f.download_count,
        lastDownloadedAt: f.last_downloaded_at,
        version: f.version,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        projectId: f.project_id,
        projectName: f.project_name,
        sharedByName: f.shared_by_name,
        lastDownloadedByName: f.last_downloaded_by_name
      })),
      summary: {
        total: Number(summary?.total || 0),
        deliverables: Number(summary?.deliverables || 0),
        assets: Number(summary?.assets || 0),
        documents: Number(summary?.documents || 0),
        references: Number(summary?.references || 0),
        totalSize: Number(summary?.total_size || 0),
        totalDownloads: Number(summary?.total_downloads || 0)
      }
    }
  } catch (error) {
    console.error('Failed to fetch files:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch files'
    })
  }
})
