// server/api/crm/records/[id].patch.ts — update a record's data/stage (re-validated).
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import {
  loadFieldDefs,
  validateAndCheckRelations,
  assertStageBelongsToClient,
  authorizeRecordRelations
} from '~~/server/utils/crm/engine/recordWrite'
import { recordFieldChanges } from '~~/server/utils/crm/audit'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({
  client_id: z.string().uuid(),
  data: z.record(z.string(), z.unknown()).optional(),
  stage_id: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const { existing, row } = await transaction(async (database) => {
    const existingResult = await database.query(
      `SELECT object_def_id, data, stage_id FROM crm_records
        WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [id, context.clientId]
    )
    const existing = existingResult.rows?.[0] as {
      object_def_id: string
      data: Record<string, unknown>
      stage_id: string | null
    } | undefined
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    const defs = await loadFieldDefs(existing.object_def_id, context.clientId, database)
    await authorizeRecordRelations(context, defs, existing.data, database)

    const sets: string[] = []
    const params: unknown[] = []
    if (b.data !== undefined) {
      const clean = await validateAndCheckRelations(defs, context.clientId, b.data, context, database)
      params.push(JSON.stringify(clean)); sets.push(`data = $${params.length}::jsonb`)
    }
    if (b.stage_id !== undefined) {
      await assertStageBelongsToClient(b.stage_id, context.clientId, database)
      params.push(b.stage_id); sets.push(`stage_id = $${params.length}`)
    }
    if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    sets.push('updated_at = NOW()')
    params.push(id); const idIdx = params.length
    params.push(context.clientId); const clientIdx = params.length
    const result = await database.query(
      `UPDATE crm_records SET ${sets.join(', ')}
        WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`,
      params
    )
    const row = result.rows?.[0] as { data: Record<string, unknown>, stage_id: string | null } | undefined
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    return { existing, row }
  })
  // Audit the record's data fields (generic key diff) + stage transitions.
  try {
    const dataKeys = [...new Set([...Object.keys(existing.data ?? {}), ...Object.keys(row.data ?? {})])]
    await recordFieldChanges({
      clientId: context.clientId, entityType: 'record', entityId: id as string,
      before: { ...(existing.data ?? {}), stage_id: existing.stage_id },
      after: { ...(row.data ?? {}), stage_id: row.stage_id },
      fields: [...dataKeys, 'stage_id'], actor: context.actorId,
    })
  } catch (e) { console.error('[crm] audit failed', e) }
  return { item: row }
})
