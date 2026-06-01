// server/api/client-portal/crm/relationships/[id].delete.ts — session-scoped.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const n = await execute(`DELETE FROM crm_relationships WHERE id = $1 AND client_id = $2`, [id, client.clientId])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Relationship not found' })
  return { ok: true }
})
