import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const { limit } = getQuery(event) as { limit?: string }
  const rowLimit = Math.min(parseInt(limit || '50', 10) || 50, 100)

  const rows = await queryRows(`
    SELECT
      id, project_id AS "projectId", format_key AS "formatKey",
      version, url,
      width, height, file_size AS "fileSize",
      is_live AS "isLive",
      published_at AS "publishedAt"
    FROM banner_published
    WHERE is_live = true
    ORDER BY published_at DESC
    LIMIT $1
  `, [rowLimit])

  return rows
})
