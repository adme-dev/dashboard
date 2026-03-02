import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Variant ID is required' })
  }

  const row = await queryOne(`
    SELECT
      id, project_id AS "projectId", feed_id AS "feedId",
      format_key AS "formatKey", row_index AS "rowIndex",
      row_data AS "rowData", r2_key AS "r2Key", url,
      width, height, file_size AS "fileSize",
      click_url AS "clickUrl", is_live AS "isLive",
      generated_by AS "generatedBy", generated_at AS "generatedAt"
    FROM banner_variants
    WHERE id = $1
  `, [id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Variant not found' })
  }

  return row
})
