import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { cloudflareRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import { attachMetaCatalogFeedForClient } from '~~/server/utils/metaCatalogApplication'

const bodySchema = z.object({
  clientId: z.uuid(),
  connectionId: z.uuid(),
  catalogId: z.string().regex(/^\d{5,30}$/),
  sourceFeedId: z.uuid()
}).strict()

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Valid client, connection, catalogue, and source feed IDs are required' })
  }

  return attachMetaCatalogFeedForClient({
    ...parsed.data,
    actorId: user.id,
    actorEmail: user.email,
    runtimeEnv: cloudflareRuntimeEnv(event)
  })
})
