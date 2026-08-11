// server/api/crm/relationships/[id].delete.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireAllCrmRecordsAccess } from '~~/server/utils/crm/recordAccess'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: client_id, surface: 'agency_global' })
  await transaction(async (db) => {
    const loaded = await db.query(
      `SELECT * FROM crm_relationships WHERE id = $1 AND client_id = $2 FOR UPDATE`,
      [id, context.clientId]
    )
    const row = loaded.rows[0] as { from_type: 'person' | 'company', from_id: string, to_type: 'person' | 'company', to_id: string } | undefined
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    await requireAllCrmRecordsAccess(context, [
      { type: row.from_type, id: row.from_id },
      { type: row.to_type, id: row.to_id }
    ], db)
    await db.query(`DELETE FROM crm_relationships WHERE id = $1 AND client_id = $2`, [id, context.clientId])
  })
  return { ok: true }
})
