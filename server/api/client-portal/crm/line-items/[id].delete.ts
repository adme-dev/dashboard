// server/api/client-portal/crm/line-items/[id].delete.ts — session-scoped delete.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { deleteLineItem } from '~~/server/utils/crm/lineItemsDb'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  await deleteLineItem(client.clientId, id)
  return { ok: true }
})
