import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { projectId } = getQuery(event)

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  const feeds = await queryRows(`
    SELECT id, project_id AS "projectId", name, source_type AS "sourceType",
           columns, row_count AS "rowCount", r2_key AS "r2Key",
           data_url AS "dataUrl", sample_data AS "sampleData",
           uploaded_by AS "uploadedBy",
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM banner_feeds
    WHERE project_id = $1
    ORDER BY created_at DESC
  `, [projectId])

  return feeds
})
