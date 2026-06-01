// server/api/client-portal/crm/bulk.post.ts — session-scoped bulk mutation.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { runBulk } from '~~/server/utils/crm/bulk'

const Body = z.object({
  entity: z.enum(['people', 'companies', 'opportunities']),
  action: z.enum(['assign', 'tag', 'untag', 'status', 'delete']),
  ids: z.array(z.string().uuid()).min(1).max(500),
  payload: z.record(z.string(), z.any()).optional().default({}),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  return await runBulk(client.clientId, { entity: b.entity, action: b.action, ids: b.ids, payload: b.payload })
})
