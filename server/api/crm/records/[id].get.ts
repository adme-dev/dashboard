// server/api/crm/records/[id].get.ts — fetch one record (client-scoped).
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { loadFieldDefs, authorizeRecordRelations } from '~~/server/utils/crm/engine/recordWrite'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: client_id, surface: 'agency_global' })
  const row = await queryOne<{ object_def_id: string, data: Record<string, unknown> } & Record<string, unknown>>(
    `SELECT * FROM crm_records WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, context.clientId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  const defs = await loadFieldDefs(row.object_def_id, context.clientId)
  await authorizeRecordRelations(context, defs, row.data)
  return { item: row }
})
