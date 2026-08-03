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
  const user = await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  const asset = await queryOne<{ id: string }>(`SELECT id FROM search_authority_content_assets WHERE id = $1 AND client_id = $2`, [assetId.data, parsed.data.clientId])
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Content asset not found' })
  await transaction(db => rejectContentVersion(db, { ...parsed.data, assetId: assetId.data, actorId: user.id }))
  return { ok: true, status: 'rejected' }
})
