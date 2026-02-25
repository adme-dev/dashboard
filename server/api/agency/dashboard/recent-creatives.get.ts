/**
 * Recent Creatives Feed
 * GET /api/agency/dashboard/recent-creatives
 *
 * Aggregates recent visual assets from proof_assets and task_attachments
 * Returns image/video files from the last 14 days for the creative gallery widget
 *
 * Query params:
 * - source: 'all' | 'proofs' | 'attachments' (default: 'all')
 * - limit: number (default: 20, max: 40)
 */

import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif']
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/avi']
const VISUAL_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES]
const VISUAL_TYPES_SQL = VISUAL_TYPES.map(t => `'${t}'`).join(', ')

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const source = (query.source as string) || 'all'
  const limit = Math.min(Number(query.limit) || 20, 40)

  try {
    const parts: string[] = []

    // Proof assets — creative proofs with project/client context
    if (source === 'all' || source === 'proofs') {
      parts.push(`
        SELECT
          'proof' AS source,
          pa.id,
          pa.file_name,
          pa.file_type,
          pa.file_size,
          pa.file_url,
          pa.thumbnail_url,
          pa.dimensions,
          pa.duration_seconds,
          cp.id AS proof_id,
          cp.name AS proof_name,
          cp.status AS proof_status,
          cp.version AS proof_version,
          p.id AS project_id,
          p.name AS project_name,
          c.id AS client_id,
          c.name AS client_name,
          t.id AS task_id,
          t.title AS task_title,
          d.name AS department_name,
          tm.id AS uploader_id,
          tm.name AS uploader_name,
          tm.avatar_url AS uploader_avatar,
          pa.created_at
        FROM proof_assets pa
        JOIN creative_proofs cp ON pa.proof_id = cp.id
        LEFT JOIN projects p ON cp.project_id = p.id
        LEFT JOIN agency_clients c ON p.client_id = c.id
        LEFT JOIN tasks t ON cp.task_id = t.id
        LEFT JOIN departments d ON t.department_id = d.id
        LEFT JOIN team_members tm ON cp.created_by = tm.id
        WHERE pa.file_type IN (${VISUAL_TYPES_SQL})
          AND pa.created_at >= NOW() - INTERVAL '14 days'
      `)
    }

    // Task attachments — files uploaded directly to tasks
    if (source === 'all' || source === 'attachments') {
      parts.push(`
        SELECT
          'attachment' AS source,
          ta.id,
          ta.file_name,
          ta.file_type,
          ta.file_size,
          ta.file_url,
          ta.thumbnail_url,
          NULL::jsonb AS dimensions,
          NULL::integer AS duration_seconds,
          NULL::uuid AS proof_id,
          NULL AS proof_name,
          NULL AS proof_status,
          NULL::integer AS proof_version,
          p.id AS project_id,
          p.name AS project_name,
          c.id AS client_id,
          c.name AS client_name,
          ta.task_id,
          t.title AS task_title,
          d.name AS department_name,
          tm.id AS uploader_id,
          tm.name AS uploader_name,
          tm.avatar_url AS uploader_avatar,
          ta.created_at
        FROM task_attachments ta
        JOIN tasks t ON ta.task_id = t.id
        LEFT JOIN departments d ON t.department_id = d.id
        LEFT JOIN projects p ON d.id = p.department_id
        LEFT JOIN agency_clients c ON p.client_id = c.id
        LEFT JOIN team_members tm ON ta.uploaded_by = tm.id
        WHERE ta.file_type IN (${VISUAL_TYPES_SQL})
          AND ta.created_at >= NOW() - INTERVAL '14 days'
      `)
    }

    if (!parts.length) {
      return { creatives: [], total: 0 }
    }

    const unionQuery = parts.join(' UNION ALL ')
    const rows = await queryRows(`
      SELECT * FROM (${unionQuery}) combined
      ORDER BY created_at DESC
      LIMIT ${limit}
    `)

    const creatives = rows.map(r => ({
      id: r.id,
      source: r.source,
      fileName: r.file_name,
      fileType: r.file_type,
      fileSize: Number(r.file_size),
      fileUrl: r.file_url,
      thumbnailUrl: r.thumbnail_url,
      dimensions: r.dimensions,
      durationSeconds: r.duration_seconds ? Number(r.duration_seconds) : null,
      isVideo: VIDEO_TYPES.includes(r.file_type),
      proof: r.proof_id ? {
        id: r.proof_id,
        name: r.proof_name,
        status: r.proof_status,
        version: r.proof_version,
      } : null,
      project: r.project_id ? {
        id: r.project_id,
        name: r.project_name,
      } : null,
      client: r.client_id ? {
        id: r.client_id,
        name: r.client_name,
      } : null,
      task: r.task_id ? {
        id: r.task_id,
        title: r.task_title,
      } : null,
      department: r.department_name || null,
      uploader: r.uploader_id ? {
        id: r.uploader_id,
        name: r.uploader_name,
        avatarUrl: r.uploader_avatar,
      } : null,
      createdAt: r.created_at,
    }))

    return { creatives, total: creatives.length }
  } catch (error: any) {
    // Graceful degradation if tables don't exist yet
    if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
      return { creatives: [], total: 0 }
    }
    console.error('Failed to fetch recent creatives:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch recent creatives',
    })
  }
})
