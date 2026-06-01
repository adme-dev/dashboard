// server/api/client-portal/crm/views/[id].delete.ts — delete a saved view (creator only).
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { deleteView } from '~~/server/utils/crm/viewsDb'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  await deleteView(id, client.clientId, client.id)
  return { ok: true }
})
