import { requireClientAuth } from '~~/server/utils/clientAuth'
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')!
  const n = await execute(
    `UPDATE leads SET status = 'contacted', contacted_at = NOW()
     WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL AND status = 'new'`,
    [id, client.client_id],
  )
  if (!n) throw createError({ statusCode: 404, statusMessage: 'not_updatable' })
  return { ok: true }
})
