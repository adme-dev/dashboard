import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { listAssets } from '~~/server/utils/audio/assets'

const QuerySchema = z.object({
  kind: z.enum(['voiceover', 'music']).optional(),
  clientId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).optional()
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const q = QuerySchema.parse(getQuery(event))
  const assets = await listAssets({ kind: q.kind, clientId: q.clientId, limit: q.limit })
  return { assets }
})
