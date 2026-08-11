// server/api/crm/audit/index.get.ts
// Field-level change history for a CRM entity, client-scoped, newest first.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'
import { authorizeRecordRelations, loadFieldDefs } from '~~/server/utils/crm/engine/recordWrite'

const Query = z.object({
  client_id: z.string().uuid(),
  entity_type: z.enum(['person', 'company', 'opportunity', 'record']),
  entity_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  if (q.entity_type === 'record') {
    const record = await queryOne<{ object_def_id: string, data: Record<string, unknown> }>(
      `SELECT object_def_id, data FROM crm_records
        WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
      [q.entity_id, context.clientId]
    )
    if (!record) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    const defs = await loadFieldDefs(record.object_def_id, context.clientId)
    await authorizeRecordRelations(context, defs, record.data)
  } else {
    await requireCrmRecordAccess(context, { type: q.entity_type, id: q.entity_id })
  }
  const items = await queryRows(
    `SELECT a.id, a.field, a.old_value, a.new_value, a.changed_at, a.changed_by, u.name AS changed_by_name
       FROM crm_audit_log a
       LEFT JOIN team_members u ON u.id = a.changed_by
      WHERE a.client_id = $1 AND a.entity_type = $2 AND a.entity_id = $3
      ORDER BY a.changed_at DESC
      LIMIT ${q.limit}`,
    [context.clientId, q.entity_type, q.entity_id],
  )
  return { items }
})
