// server/api/client-portal/crm/custom-fields/[id].delete.ts — session-scoped.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const n = await execute(`DELETE FROM crm_custom_fields WHERE id = $1 AND client_id = $2`, [id, client.clientId])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Field not found' })
  return { ok: true }
})
