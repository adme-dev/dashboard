// server/api/crm/records/[id].delete.ts — soft-delete a record.
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { loadFieldDefs, authorizeRecordRelations } from '~~/server/utils/crm/engine/recordWrite'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: client_id, surface: 'agency_global' })
  await transaction(async (database) => {
    const existingResult = await database.query(
      `SELECT object_def_id, data FROM crm_records
        WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [id, context.clientId]
    )
    const existing = existingResult.rows?.[0] as { object_def_id: string, data: Record<string, unknown> } | undefined
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    const defs = await loadFieldDefs(existing.object_def_id, context.clientId, database)
    await authorizeRecordRelations(context, defs, existing.data, database)
    await database.query(
      `UPDATE crm_records SET deleted_at = NOW()
        WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
      [id, context.clientId]
    )
  })
  return { ok: true }
})
