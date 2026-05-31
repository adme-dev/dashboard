// server/api/client-portal/crm/people/[id].delete.ts — session-scoped.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const n = await execute(
    `UPDATE crm_people SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client.clientId],
  )
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  return { ok: true }
})
