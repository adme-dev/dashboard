import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { addEmailClientScopeCondition, resolveEmailClientScope } from '~~/server/utils/email-marketing/access'
import { EMAIL_IMAGE_ASSET_MIME_TYPES } from '~~/app/utils/edmImageAssets'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)
  const search = typeof query.search === 'string' ? query.search.trim() : ''
  const clientIds = await resolveEmailClientScope(event, user)

  const params: unknown[] = [EMAIL_IMAGE_ASSET_MIME_TYPES]
  const conditions = ['mime_type = ANY($1::text[])']
  addEmailClientScopeCondition(conditions, params, 'client_id', clientIds)
  let sql = `
    SELECT
      id,
      name,
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
    WHERE ${conditions.join(' AND ')}
  `

  if (search) {
    params.push(`%${search}%`)
    sql += ` AND name ILIKE $${params.length}`
  }

  sql += ' ORDER BY created_at DESC LIMIT 120'
  const assets = await queryRows(sql, params)
  return { assets }
})
