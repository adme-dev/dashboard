// server/api/client-portal/crm/views/index.get.ts — session-scoped saved views.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { listViews } from '~~/server/utils/crm/viewsDb'

const Query = z.object({ entity: z.enum(['people', 'companies', 'opportunities']) })

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  return { items: await listViews(client.clientId, q.entity, client.id) }
})
