// server/api/crm/communications/[id].delete.ts — soft-delete a communication.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { deleteComm } from '~~/server/utils/crm/commsDb'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const q = Query.parse(getQuery(event))
  const ok = await deleteComm(id, q.client_id)
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'Communication not found' })
  return { ok: true }
})
