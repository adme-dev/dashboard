import { z } from 'zod'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { contentAssetInputSchema } from '~~/server/utils/searchAuthority/contentContracts'
import { createContentAsset } from '~~/server/utils/searchAuthority/contentRepository'
import { executeSearchAuthorityMutation } from '~~/server/utils/searchAuthority/godModeMutations'

const Body = contentAssetInputSchema.extend({ clientId: z.string().uuid(), siteId: z.string().uuid() })
export default eventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid governed content asset' })
  const user = await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  return executeSearchAuthorityMutation(event, 'asset-create',
    db => createContentAsset(db, { ...parsed.data, actorId: user.id }),
    async (db, id) => {
      const row = await db.query(`
        SELECT asset.id, asset.status, interview.id AS interview_id
        FROM search_authority_content_assets asset
        LEFT JOIN search_authority_source_interviews interview
          ON interview.client_id = asset.client_id AND interview.asset_id = asset.id
        WHERE asset.id = $1 AND asset.client_id = $2
        ORDER BY interview.created_at ASC LIMIT 1`, [id, parsed.data.clientId])
      const asset = row.rows[0] as { id: string, status: string, interview_id: string | null } | undefined
      if (!asset) throw new Error('Replayed content asset no longer exists')
      return { id: asset.id, status: asset.status, interviewId: String(asset.interview_id ?? '') }
    })
})
