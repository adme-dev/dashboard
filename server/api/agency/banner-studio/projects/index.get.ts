import { queryRowsFresh } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { hasAllSocialClientAccess, hasSocialClientPermission, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  setHeader(event, 'Cache-Control', 'private, no-store')

  const query = getQuery(event)
  const { clientId, status, search, limit, offset } = query
  if (clientId) await requireSocialClientAccess(event, String(clientId))

  try {
    let sql = `
      SELECT
        p.id, p.name,
        p.client_id AS "clientId",
        c.name AS "clientName",
        p.canvas_data AS "canvasData",
        p.thumbnail_url AS "thumbnailUrl",
        p.status,
        p.tags,
        p.created_by AS "createdBy",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt"
      FROM banner_projects p
      LEFT JOIN agency_clients c ON p.client_id = c.id
      WHERE 1=1
    `

    const params: any[] = []
    let paramIndex = 1
    if (!hasAllSocialClientAccess(user)) {
      sql += ` AND ((p.client_id IS NULL AND p.created_by = $${paramIndex})`
      params.push(user.id)
      if (hasSocialClientPermission(user)) {
        sql += ` OR EXISTS (SELECT 1 FROM client_team_assignments a WHERE a.client_id = p.client_id AND a.team_member_id = $${paramIndex})`
      }
      sql += ')'
      paramIndex++
    } else if (!hasSocialClientPermission(user)) {
      sql += ' AND p.client_id IS NULL'
    }

    if (clientId) {
      sql += ` AND p.client_id = $${paramIndex}`
      params.push(clientId)
      paramIndex++
    }

    if (status && status !== 'all') {
      sql += ` AND p.status = $${paramIndex}`
      params.push(status)
      paramIndex++
    }

    if (search) {
      sql += ` AND p.name ILIKE $${paramIndex}`
      params.push(`%${search}%`)
      paramIndex++
    }

    sql += ' ORDER BY p.updated_at DESC'

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

    return await queryRowsFresh(sql, params)
  } catch (error: any) {
    console.error('Failed to fetch banner projects:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch banner projects' })
  }
})
