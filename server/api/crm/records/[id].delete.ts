// server/api/crm/records/[id].delete.ts — soft-delete a record.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const n = await execute(
    `UPDATE crm_records SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client_id],
  )
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  return { ok: true }
})
