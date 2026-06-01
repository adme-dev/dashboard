// server/api/client-portal/crm/records/[id].patch.ts — update a record (re-validated, session-scoped).
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'
import { loadFieldDefs, validateAndCheckRelations, assertStageBelongsToClient } from '~~/server/utils/crm/engine/recordWrite'

const Body = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  stage_id: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const existing = await queryOne<{ object_def_id: string }>(
    `SELECT object_def_id FROM crm_records WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client.clientId],
  )
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  const sets: string[] = []
  const params: unknown[] = []
  if (b.data !== undefined) {
    const defs = await loadFieldDefs(existing.object_def_id, client.clientId)
    const clean = await validateAndCheckRelations(defs, client.clientId, b.data)
    params.push(JSON.stringify(clean)); sets.push(`data = $${params.length}::jsonb`)
  }
  if (b.stage_id !== undefined) {
    await assertStageBelongsToClient(b.stage_id, client.clientId)
    params.push(b.stage_id); sets.push(`stage_id = $${params.length}`)
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')
  params.push(id); const idIdx = params.length
  params.push(client.clientId); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_records SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`,
    params,
  )
  return { item: row }
})
