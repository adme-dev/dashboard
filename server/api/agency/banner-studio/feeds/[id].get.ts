import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  const feed = await queryOne(`
    SELECT id, project_id AS "projectId", name, source_type AS "sourceType",
           columns, row_count AS "rowCount", r2_key AS "r2Key",
           data_url AS "dataUrl", sample_data AS "sampleData",
           uploaded_by AS "uploadedBy",
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM banner_feeds
    WHERE id = $1
  `, [id])

  if (!feed) {
    throw createError({ statusCode: 404, statusMessage: 'Feed not found' })
  }

  return feed
})
