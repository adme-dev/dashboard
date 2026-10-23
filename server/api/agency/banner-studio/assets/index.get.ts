import { queryRowsFresh } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { hasAllSocialClientAccess, hasSocialClientPermission, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  setHeader(event, 'Cache-Control', 'private, no-store')

  const query = getQuery(event)
  const { clientId, search, limit, offset } = query
  if (clientId) await requireSocialClientAccess(event, String(clientId))

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
        client_id AS "clientId",
        created_at AS "createdAt"
      FROM banner_assets
      WHERE 1=1
    `

    const params: any[] = []
    let paramIndex = 1
    if (!hasAllSocialClientAccess(user)) {
      sql += ` AND ((client_id IS NULL AND uploaded_by = $${paramIndex})`
      params.push(user.id)
      if (hasSocialClientPermission(user)) {
        sql += ` OR EXISTS (SELECT 1 FROM client_team_assignments a WHERE a.client_id = banner_assets.client_id AND a.team_member_id = $${paramIndex})`
      }
      sql += ')'
      paramIndex++
    } else if (!hasSocialClientPermission(user)) {
      sql += ' AND client_id IS NULL'
    }
    if (clientId) {
      sql += ` AND client_id = $${paramIndex}`
      params.push(clientId)
      paramIndex++
    }

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

    const assets = await queryRowsFresh(sql, params)
    return { assets }
  } catch (error: any) {
    console.error('Failed to fetch banner assets:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch banner assets' })
  }
})
