import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const { limit, offset } = getQuery(event) as { limit?: string; offset?: string }
  const rowLimit = Math.min(parseInt(limit || '50', 10) || 50, 100)
  const rowOffset = Math.max(parseInt(offset || '0', 10) || 0, 0)

  const rows = await queryRows(`
    SELECT i.id, i.template_id AS "templateId", i.name,
      i.variable_values AS "variableValues",
      i.width, i.height,
      i.published_url AS "publishedUrl",
      i.is_published AS "isPublished",
      i.click_url AS "clickUrl",
      i.client_id AS "clientId",
      i.created_at AS "createdAt",
      i.updated_at AS "updatedAt",
      t.name AS "templateName",
      t.category AS "templateCategory",
      t.thumbnail_url AS "templateThumbnail"
    FROM banner_custom_instances i
    JOIN banner_custom_templates t ON t.id = i.template_id
    WHERE i.created_by = $1
    ORDER BY i.updated_at DESC
    LIMIT $2 OFFSET $3
  `, [user.id, rowLimit, rowOffset])

  return rows
})
