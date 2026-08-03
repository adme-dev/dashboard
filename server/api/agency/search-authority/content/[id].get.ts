import { getRouterParam } from 'h3'
import { z } from 'zod'
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'

export default eventHandler(async (event) => {
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Invalid content asset ID' })
  const asset = await queryOne<{ client_id: string } & Record<string, unknown>>(
    `SELECT * FROM search_authority_content_assets WHERE id = $1`, [id.data])
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Content asset not found' })
  await requireAgencySearchAuthorityAccess(event, asset.client_id)
  const [versions, interviews, decisions] = await Promise.all([
    queryRows(`SELECT * FROM search_authority_content_versions WHERE client_id = $1 AND asset_id = $2 ORDER BY version_number DESC`, [asset.client_id, id.data]),
    queryRows(`SELECT * FROM search_authority_source_interviews WHERE client_id = $1 AND asset_id = $2 ORDER BY occurred_at DESC`, [asset.client_id, id.data]),
    queryRows(`SELECT * FROM search_authority_approval_decisions WHERE client_id = $1 AND asset_id = $2 ORDER BY decided_at DESC`, [asset.client_id, id.data])
  ])
  return { asset, versions, interviews, decisions }
})
