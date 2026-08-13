import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { cloudflareRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import { getMetaCatalogReadinessForClient } from '~~/server/utils/metaCatalogApplication'

const querySchema = z.object({
  clientId: z.uuid(),
  connectionId: z.uuid()
})

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'clientId and connectionId are required' })
  }

  return getMetaCatalogReadinessForClient({
    ...parsed.data,
    actorEmail: user.email,
    runtimeEnv: cloudflareRuntimeEnv(event)
  })
})
