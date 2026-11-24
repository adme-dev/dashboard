import { queryRowsFresh } from '~~/server/utils/db'
import { hasFreshMarketingManagementPermission } from '~~/server/utils/clientScoping'
import { requireAuth } from '~~/server/utils/auth'
import { hasAllBannerClientAccess, hasBannerClientPermission, requireBannerClientAccess } from '~~/server/utils/banner/clientAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  setHeader(event, 'Cache-Control', 'private, no-store')

  const query = getQuery(event)
  const { clientId, status, search, limit, offset } = query
  if (clientId) await requireBannerClientAccess(event, String(clientId))
  const marketingPortfolio = user.permissionGroups?.includes('MARKETING_MANAGEMENT') === true
  if (marketingPortfolio && !await hasFreshMarketingManagementPermission(user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'Marketing permission revoked' })
  }

  try {
    let sql = `
      SELECT
        p.id, p.name, CASE WHEN f.binned_at IS NULL THEN p.folder_id ELSE NULL END AS "folderId",
        p.client_id AS "clientId",
        p.binned_at + interval '30 days' AS "expiresAt",
        c.name AS "clientName",
        ${(query.view === 'gallery' || query.view === 'bin')
          ? 'ARRAY(SELECT jsonb_object_keys(p.canvas_data)) AS "formats",'
          : query.view === 'library'
            ? `
        ARRAY(SELECT key FROM jsonb_each(p.canvas_data)) AS "formats",
        ARRAY(SELECT key FROM jsonb_each(p.canvas_data) WHERE
          CASE WHEN jsonb_typeof(value->'layers') = 'array'
            THEN jsonb_array_length(value->'layers') > 0 ELSE FALSE END
        ) AS "populatedFormats",`
            : 'p.canvas_data AS "canvasData",'}
        p.thumbnail_url AS "thumbnailUrl",
        p.status,
        p.tags,
        p.created_by AS "createdBy",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt"
      FROM banner_projects p
      LEFT JOIN agency_clients c ON p.client_id = c.id
      LEFT JOIN banner_folders f ON f.id = p.folder_id
      WHERE ${query.view === 'bin'
        ? 'p.binned_at > now() - interval \'30 days\''
        : 'p.binned_at IS NULL'}
    `

    const params: any[] = []
    let paramIndex = 1
    if (!await hasAllBannerClientAccess(user)) {
      sql += ` AND ((p.client_id IS NULL AND p.created_by = $${paramIndex})`
      params.push(user.id)
      if (marketingPortfolio) {
        sql += ` OR EXISTS (SELECT 1 FROM agency_clients active_client WHERE active_client.id = p.client_id AND active_client.is_active = TRUE)`
      } else if (hasBannerClientPermission(user)) {
        sql += ` OR EXISTS (SELECT 1 FROM client_team_assignments a WHERE a.client_id = p.client_id AND a.team_member_id = $${paramIndex})`
      }
      sql += ')'
      paramIndex++
    } else if (!hasBannerClientPermission(user)) {
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
