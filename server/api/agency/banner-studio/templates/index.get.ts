import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const { category, search, tag } = query

  try {
    let sql = `
      SELECT
        id, name, category,
        canvas_data AS "canvasData",
        thumbnail_url AS "thumbnailUrl",
        preview_url AS "previewUrl",
        description,
        is_system AS "isSystem",
        tags, formats,
        usage_count AS "usageCount",
        created_by AS "createdBy",
        created_at AS "createdAt"
      FROM banner_templates
      WHERE 1=1
    `

    const params: any[] = []
    let paramIndex = 1

    if (category && category !== 'all') {
      sql += ` AND category = $${paramIndex}`
      params.push(category)
      paramIndex++
    }

    if (search) {
      // Escape ILIKE wildcards in user input to prevent wildcard injection
      const escapedSearch = String(search).replace(/%/g, '\\%').replace(/_/g, '\\_')
      sql += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`
      params.push(`%${escapedSearch}%`)
      paramIndex++
    }

    if (tag) {
      sql += ` AND $${paramIndex} = ANY(tags)`
      params.push(tag)
      paramIndex++
    }

    sql += ' ORDER BY is_system DESC, usage_count DESC NULLS LAST, created_at DESC'

    return await queryRows(sql, params)
  } catch (error: any) {
    console.error('Failed to fetch banner templates:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch banner templates' })
  }
})
