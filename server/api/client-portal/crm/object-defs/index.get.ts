// server/api/client-portal/crm/object-defs/index.get.ts — config objects visible to this client.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { resolveClientObjects } from '~~/server/utils/crm/engine/resolveObjects'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  return { items: await resolveClientObjects(client.clientId) }
})
