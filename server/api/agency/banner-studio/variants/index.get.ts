import { queryRows, queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const projectId = query.projectId as string
  const feedId = query.feedId as string | undefined
  const formatKey = query.formatKey as string | undefined
  const offset = Math.max(0, parseInt(query.offset as string) || 0)
  const limit = Math.min(200, Math.max(1, parseInt(query.limit as string) || 50))

  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'projectId is required' })
  }

  const conditions: string[] = ['project_id = $1']
  const params: any[] = [projectId]
  let paramIndex = 2

  if (feedId) {
    conditions.push(`feed_id = $${paramIndex}`)
    params.push(feedId)
    paramIndex++
  }

  if (formatKey) {
    conditions.push(`format_key = $${paramIndex}`)
    params.push(formatKey)
    paramIndex++
  }

  const where = conditions.join(' AND ')

  const countRow = await queryOne(
    `SELECT COUNT(*)::int AS total FROM banner_variants WHERE ${where}`,
    params,
  )

  params.push(limit, offset)
  const variants = await queryRows(`
    SELECT
      id, project_id AS "projectId", feed_id AS "feedId",
      format_key AS "formatKey", row_index AS "rowIndex",
      row_data AS "rowData", r2_key AS "r2Key", url,
      width, height, file_size AS "fileSize",
      click_url AS "clickUrl", is_live AS "isLive",
      generated_by AS "generatedBy", generated_at AS "generatedAt"
    FROM banner_variants
    WHERE ${where}
    ORDER BY row_index ASC, format_key ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, params)

  return {
    variants,
    total: countRow?.total || 0,
  }
})
