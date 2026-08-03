import { getQuery, getRouterParam } from 'h3'
import { z } from 'zod'
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'

export default eventHandler(async (event) => {
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const clientId = z.string().uuid().safeParse(getQuery(event).clientId)
  if (!id.success || !clientId.success) throw createError({ statusCode: 400, statusMessage: 'Invalid content asset request' })
  await requireAgencySearchAuthorityAccess(event, clientId.data)
  const asset = await queryOne<Record<string, unknown>>(
    `SELECT * FROM search_authority_content_assets WHERE id = $1 AND client_id = $2`, [id.data, clientId.data])
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Content asset not found' })
  const [versions, interviews, decisions, claims] = await Promise.all([
    queryRows(`SELECT * FROM search_authority_content_versions WHERE client_id = $1 AND asset_id = $2 ORDER BY version_number DESC`, [clientId.data, id.data]),
    queryRows(`SELECT * FROM search_authority_source_interviews WHERE client_id = $1 AND asset_id = $2 ORDER BY occurred_at DESC`, [clientId.data, id.data]),
    queryRows(`SELECT * FROM search_authority_approval_decisions WHERE client_id = $1 AND asset_id = $2 ORDER BY decided_at DESC`, [clientId.data, id.data]),
    queryRows(`SELECT claim.id, claim.version_id, claim.claim, claim.source_type,
      claim.source_reference, claim.expires_at
      FROM search_authority_version_claims claim
      JOIN search_authority_content_versions version
        ON version.client_id = claim.client_id AND version.id = claim.version_id
      WHERE claim.client_id = $1 AND version.asset_id = $2
      ORDER BY claim.created_at`, [clientId.data, id.data])
  ])
  return { asset, versions, interviews, decisions, claims }
})
