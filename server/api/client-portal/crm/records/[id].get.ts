// server/api/client-portal/crm/records/[id].get.ts — fetch one record (session-scoped).
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const row = await queryOne(
    `SELECT * FROM crm_records WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client.clientId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  return { item: row }
})
