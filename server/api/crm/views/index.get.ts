// server/api/crm/views/index.get.ts — list saved views for a client+entity (own + shared).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listViews } from '~~/server/utils/crm/viewsDb'

const Query = z.object({
  client_id: z.string().uuid(),
  entity: z.enum(['people', 'companies', 'opportunities']),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const q = Query.parse(getQuery(event))
  return { items: await listViews(q.client_id, q.entity, user.id) }
})
