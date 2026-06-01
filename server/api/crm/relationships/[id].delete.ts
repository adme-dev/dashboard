// server/api/crm/relationships/[id].delete.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const n = await execute(`DELETE FROM crm_relationships WHERE id = $1 AND client_id = $2`, [id, client_id])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Relationship not found' })
  return { ok: true }
})
