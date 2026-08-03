import { getRouterParam } from 'h3'
import { z } from 'zod'
import { queryOne, transaction } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { contentVersionInputSchema } from '~~/server/utils/searchAuthority/contentContracts'
import { createContentVersion } from '~~/server/utils/searchAuthority/contentRepository'

const Body = contentVersionInputSchema.extend({ clientId: z.string().uuid() })
export default eventHandler(async (event) => {
  const assetId = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const parsed = Body.safeParse(await readBody(event))
  if (!assetId.success || !parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid content version' })
  const asset = await queryOne<{ client_id: string }>(`SELECT client_id FROM search_authority_content_assets WHERE id = $1`, [assetId.data])
  if (!asset || asset.client_id !== parsed.data.clientId) throw createError({ statusCode: 404, statusMessage: 'Content asset not found' })
  const user = await requireAgencySearchAuthorityAccess(event, asset.client_id)
  return transaction(db => createContentVersion(db, { ...parsed.data, assetId: assetId.data, actorId: user.id }))
})
