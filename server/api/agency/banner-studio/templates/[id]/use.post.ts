import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const row = await queryOne(`
    UPDATE banner_templates
    SET usage_count = COALESCE(usage_count, 0) + 1
    WHERE id = $1
    RETURNING id, usage_count AS "usageCount"
  `, [id])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  return row
})
