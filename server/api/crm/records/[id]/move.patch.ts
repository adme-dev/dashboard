// server/api/crm/records/[id]/move.patch.ts — move a record to a different stage (kanban).
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import {
  assertStageBelongsToClient,
  authorizeRecordRelations,
  loadFieldDefs
} from '~~/server/utils/crm/engine/recordWrite'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({ client_id: z.string().uuid(), stage_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const row = await transaction(async (database) => {
    const existingResult = await database.query(
      `SELECT object_def_id, data FROM crm_records
        WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [id, context.clientId]
    )
    const existing = existingResult.rows?.[0] as { object_def_id: string, data: Record<string, unknown> } | undefined
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    const defs = await loadFieldDefs(existing.object_def_id, context.clientId, database)
    await authorizeRecordRelations(context, defs, existing.data, database)
    await assertStageBelongsToClient(b.stage_id, context.clientId, database)
    const result = await database.query(
      `UPDATE crm_records SET stage_id = $1, updated_at = NOW()
        WHERE id = $2 AND client_id = $3 AND deleted_at IS NULL RETURNING *`,
      [b.stage_id, id, context.clientId]
    )
    const updated = result.rows?.[0]
    if (!updated) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    return updated
  })
  return { item: row }
})
