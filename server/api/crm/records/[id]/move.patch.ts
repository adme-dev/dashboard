// server/api/crm/records/[id]/move.patch.ts — move a record to a different stage (kanban).
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({ client_id: z.string().uuid(), stage_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  // Stage must belong to this client (config-object stages are always per-client).
  const stage = await queryOne<{ id: string }>(
    `SELECT id FROM crm_stages WHERE id = $1 AND client_id = $2`,
    [b.stage_id, b.client_id],
  )
  if (!stage) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  const row = await queryOne(
    `UPDATE crm_records SET stage_id = $1, updated_at = NOW()
      WHERE id = $2 AND client_id = $3 AND deleted_at IS NULL RETURNING *`,
    [b.stage_id, id, b.client_id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  return { item: row }
})
