import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const query = getQuery(event)
  const { clientId, status, search, limit, offset } = query

  try {
    let sql = `
      SELECT
        p.id, p.name,
        p.client_id AS "clientId",
        c.name AS "clientName",
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

    return await queryRows(sql, params)
  } catch (error: any) {
    console.error('Failed to fetch banner projects:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch banner projects' })
  }
})
