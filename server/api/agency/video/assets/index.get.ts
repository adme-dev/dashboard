import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { listVideoAssetsForUser } from '~~/server/utils/video/assets'

const QuerySchema = z.object({ clientId: z.string().uuid().optional(), limit: z.coerce.number().int().positive().max(200).optional() })

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const q = QuerySchema.parse(getQuery(event))
  return { assets: await listVideoAssetsForUser(user, { clientId: q.clientId, limit: q.limit }) }
})
