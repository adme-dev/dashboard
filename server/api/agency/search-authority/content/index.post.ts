import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { contentAssetInputSchema } from '~~/server/utils/searchAuthority/contentContracts'
import { createContentAsset } from '~~/server/utils/searchAuthority/contentRepository'

const Body = contentAssetInputSchema.extend({ clientId: z.string().uuid(), siteId: z.string().uuid() })
export default eventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid governed content asset' })
  const user = await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  return transaction(db => createContentAsset(db, { ...parsed.data, actorId: user.id }))
})
