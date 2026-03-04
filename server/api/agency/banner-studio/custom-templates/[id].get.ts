import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID required' })

  const row = await queryOne(`
    SELECT id, name, category, description, tags,
      html, css, js, variables,
      width, height, thumbnail_url AS "thumbnailUrl",
      preview_url AS "previewUrl",
      external_scripts AS "externalScripts",
      external_styles AS "externalStyles",
      is_system AS "isSystem", usage_count AS "usageCount",
      created_by AS "createdBy", created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM banner_custom_templates
    WHERE id = $1
  `, [id])

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  return row
})
