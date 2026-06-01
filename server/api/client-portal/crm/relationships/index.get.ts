// server/api/client-portal/crm/relationships/index.get.ts — session-scoped.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { listRelationships } from '~~/server/utils/crm/relationshipsDb'

const Query = z.object({
  target_type: z.enum(['person', 'company']),
  target_id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  return { items: await listRelationships(client.clientId, q.target_type, q.target_id) }
})
