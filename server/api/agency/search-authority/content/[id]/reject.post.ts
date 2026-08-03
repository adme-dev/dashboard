import { getRouterParam } from 'h3'
import { z } from 'zod'
import { queryOne, transaction } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { contentDecisionInputSchema } from '~~/server/utils/searchAuthority/contentContracts'
import { rejectContentVersion } from '~~/server/utils/searchAuthority/contentRepository'

const Body = contentDecisionInputSchema.extend({ clientId: z.string().uuid() })
export default eventHandler(async (event) => {
  const assetId = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const parsed = Body.safeParse(await readBody(event))
  if (!assetId.success || !parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid rejection decision' })
  const asset = await queryOne<{ client_id: string }>(`SELECT client_id FROM search_authority_content_assets WHERE id = $1`, [assetId.data])
  if (!asset || asset.client_id !== parsed.data.clientId) throw createError({ statusCode: 404, statusMessage: 'Content asset not found' })
  const user = await requireAgencySearchAuthorityAccess(event, asset.client_id)
  await transaction(db => rejectContentVersion(db, { ...parsed.data, assetId: assetId.data, actorId: user.id }))
  return { ok: true, status: 'rejected' }
})
