// server/api/crm/views/[id].delete.ts — delete a saved view (creator only).
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { deleteView } from '~~/server/utils/crm/viewsDb'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const q = Query.parse(getQuery(event))
  await deleteView(id, q.client_id, user.id)
  return { ok: true }
})
