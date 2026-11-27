import { queryRowsFresh } from '~~/server/utils/db'
import { hasFreshMarketingManagementPermission } from '~~/server/utils/clientScoping'
import { requireAuth } from '~~/server/utils/auth'
import { hasAllBannerClientAccess, hasBannerClientPermission, requireBannerClientAccess } from '~~/server/utils/banner/clientAccess'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  setHeader(event, 'Cache-Control', 'private, no-store')

  const query = getQuery(event)
  const { clientId, search, limit, offset, mediaType } = query
  if (clientId) await requireBannerClientAccess(event, String(clientId))
  const marketingPortfolio = user.permissionGroups?.includes('MARKETING_MANAGEMENT') === true
  if (marketingPortfolio && !await hasFreshMarketingManagementPermission(user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'Marketing permission revoked' })
  }

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
    if (!await hasAllBannerClientAccess(user)) {
      sql += ` AND ((client_id IS NULL AND uploaded_by = $${paramIndex})`
      params.push(user.id)
      if (marketingPortfolio) {
        sql += ` OR EXISTS (SELECT 1 FROM agency_clients active_client WHERE active_client.id = banner_assets.client_id AND active_client.is_active = TRUE)`
      } else if (hasBannerClientPermission(user)) {
        sql += ` OR EXISTS (SELECT 1 FROM client_team_assignments a WHERE a.client_id = banner_assets.client_id AND a.team_member_id = $${paramIndex})`
      }
      sql += ')'
      paramIndex++
    } else if (!hasBannerClientPermission(user)) {
      sql += ' AND client_id IS NULL'
    }
    if (clientId) {
      sql += ` AND client_id = $${paramIndex}`
      params.push(clientId)
      paramIndex++
    }

    if (mediaType === 'all') {
      sql += " AND (mime_type LIKE 'image/%' OR mime_type LIKE 'video/%' OR mime_type LIKE 'audio/%')"
    } else if (mediaType === 'image' || mediaType === 'video' || mediaType === 'audio') {
      sql += ` AND mime_type LIKE $${paramIndex++}`
      params.push(mediaType + '/%')
    }

    if (mediaType === 'audio' && query.audioUploadsOnly === 'true') {
      sql += " AND NOT (COALESCE(tags, ARRAY[]::text[]) @> ARRAY['audio-studio']::text[])"
    }

    if (search) {
      sql += ` AND name ILIKE $${paramIndex}`
      params.push(`%${search}%`)
      paramIndex++
    }

    sql += ' ORDER BY created_at DESC, id DESC'

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
