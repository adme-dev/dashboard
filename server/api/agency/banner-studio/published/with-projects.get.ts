import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const { limit } = getQuery(event) as { limit?: string }
  const rowLimit = Math.min(parseInt(limit || '200', 10) || 200, 500)

  const rows = await queryRows(`
    SELECT
      bp.id, bp.project_id AS "projectId", proj.name AS "projectName",
      bp.format_key AS "formatKey", bp.url, bp.width, bp.height,
      bp.file_size AS "fileSize", bp.published_at AS "publishedAt"
    FROM banner_published bp
    JOIN banner_projects proj ON proj.id = bp.project_id
    WHERE bp.is_live = true
    ORDER BY proj.name, bp.format_key
    LIMIT $1
  `, [rowLimit])

  return rows
})
