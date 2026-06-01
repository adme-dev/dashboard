// server/api/crm/line-items/[id].delete.ts — remove a line-item (re-derives opp value).
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { deleteLineItem } from '~~/server/utils/crm/lineItemsDb'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const q = Query.parse(getQuery(event))
  await deleteLineItem(q.client_id, id)
  return { ok: true }
})
