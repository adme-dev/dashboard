// server/api/crm/targets/[id].delete.ts — remove a sales target.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { deleteTarget } from '~~/server/utils/crm/targetsDb'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')!
  const q = Query.parse(getQuery(event))
  const ok = await deleteTarget(id, q.client_id)
  if (!ok) throw createError({ statusCode: 404, statusMessage: 'Target not found' })
  return { ok: true }
})
