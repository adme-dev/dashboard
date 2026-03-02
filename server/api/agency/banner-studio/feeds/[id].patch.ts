import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const { name } = await readBody(event)

  if (!name || typeof name !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'name is required' })
  }

  const feed = await queryOne(`
    UPDATE banner_feeds SET name = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING id, project_id AS "projectId", name, source_type AS "sourceType",
              columns, row_count AS "rowCount", r2_key AS "r2Key",
              data_url AS "dataUrl", sample_data AS "sampleData",
              uploaded_by AS "uploadedBy",
              created_at AS "createdAt", updated_at AS "updatedAt"
  `, [name, id])

  if (!feed) {
    throw createError({ statusCode: 404, statusMessage: 'Feed not found' })
  }

  return feed
})
