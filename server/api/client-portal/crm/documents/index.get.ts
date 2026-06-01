// server/api/client-portal/crm/documents/index.get.ts — session-scoped list.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { listDocuments } from '~~/server/utils/crm/documentsDb'

const Query = z.object({
  target_type: z.enum(['person', 'company', 'opportunity']),
  target_id: z.string().uuid(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  return { items: await listDocuments(client.clientId, q.target_type, q.target_id) }
})
