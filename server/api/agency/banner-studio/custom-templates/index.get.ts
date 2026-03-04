import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { CUSTOM_TEMPLATE_CATEGORIES } from '~~/server/utils/customTemplateUtils'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const { search, category, tag, limit, offset } = getQuery(event) as {
    search?: string
    category?: string
    tag?: string
    limit?: string
    offset?: string
  }

  const conditions: string[] = []
  const params: any[] = []
  let paramIdx = 1

  if (category && CUSTOM_TEMPLATE_CATEGORIES.includes(category as any)) {
    conditions.push(`category = $${paramIdx}`)
    params.push(category)
    paramIdx++
  }

  if (search) {
    const escaped = String(search).replace(/%/g, '\\%').replace(/_/g, '\\_')
    conditions.push(`(name ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`)
    params.push(`%${escaped}%`)
    paramIdx++
  }

  if (tag) {
    conditions.push(`$${paramIdx} = ANY(tags)`)
    params.push(String(tag))
    paramIdx++
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rowLimit = Math.min(parseInt(limit || '50', 10) || 50, 100)
  const rowOffset = Math.max(parseInt(offset || '0', 10) || 0, 0)

  params.push(rowLimit, rowOffset)

  const rows = await queryRows(`
    SELECT id, name, category, description, tags,
      width, height, thumbnail_url AS "thumbnailUrl",
      preview_url AS "previewUrl",
      external_scripts AS "externalScripts",
      external_styles AS "externalStyles",
      is_system AS "isSystem", usage_count AS "usageCount",
      created_by AS "createdBy", created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM banner_custom_templates
    ${where}
    ORDER BY usage_count DESC, created_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `, params)

  return rows
})
