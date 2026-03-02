import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const { search, limit, offset } = query

  try {
    let sql = `
      SELECT
        id, name,
        mime_type AS "mimeType",
        file_size AS "fileSize",
        r2_key AS "r2Key",
        url,
        thumbnail_url AS "thumbnailUrl",
        tags,
        uploaded_by AS "uploadedBy",
        created_at AS "createdAt"
      FROM banner_assets
      WHERE 1=1
    `

    const params: any[] = []
    let paramIndex = 1

    if (search) {
      sql += ` AND name ILIKE $${paramIndex}`
      params.push(`%${search}%`)
      paramIndex++
    }

    sql += ' ORDER BY created_at DESC'

    if (limit) {
      sql += ` LIMIT $${paramIndex}`
      params.push(Number(limit))
      paramIndex++
    }

    if (offset) {
      sql += ` OFFSET $${paramIndex}`
      params.push(Number(offset))
      paramIndex++
    }

    return await queryRows(sql, params)
  } catch (error: any) {
    console.error('Failed to fetch banner assets:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch banner assets' })
  }
})
