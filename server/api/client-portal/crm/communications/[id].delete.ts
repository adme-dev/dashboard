// server/api/client-portal/crm/communications/[id].delete.ts — soft-delete (session-scoped).
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { deleteComm } from '~~/server/utils/crm/commsDb'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const ok = await deleteComm(id, client.clientId)
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'Communication not found' })
  return { ok: true }
})
