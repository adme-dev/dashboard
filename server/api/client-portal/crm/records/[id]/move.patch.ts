// server/api/client-portal/crm/records/[id]/move.patch.ts — move a record to a stage (session-scoped).
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({ stage_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const stage = await queryOne<{ id: string }>(
    `SELECT id FROM crm_stages WHERE id = $1 AND client_id = $2`,
    [parsed.data.stage_id, client.clientId],
  )
  if (!stage) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  const row = await queryOne(
    `UPDATE crm_records SET stage_id = $1, updated_at = NOW() WHERE id = $2 AND client_id = $3 AND deleted_at IS NULL RETURNING *`,
    [parsed.data.stage_id, id, client.clientId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  return { item: row }
})
