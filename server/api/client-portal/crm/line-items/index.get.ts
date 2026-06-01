// server/api/client-portal/crm/line-items/index.get.ts — session-scoped list.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { listLineItems } from '~~/server/utils/crm/lineItemsDb'

const Query = z.object({ opportunity_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  return { items: await listLineItems(client.clientId, q.opportunity_id) }
})
