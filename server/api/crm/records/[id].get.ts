// server/api/crm/records/[id].get.ts — fetch one record (client-scoped).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const row = await queryOne(
    `SELECT * FROM crm_records WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client_id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  return { item: row }
})
