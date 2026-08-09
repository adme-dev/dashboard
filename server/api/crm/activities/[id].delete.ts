// server/api/crm/activities/[id].delete.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: client_id, surface: 'agency_global' })
  await transaction(async (db) => {
    await requireCrmRecordAccess(context, { type: 'activity', id: id as string }, db)
    const result = await db.query(
      `UPDATE crm_activities SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL RETURNING id`,
      [id, context.clientId]
    )
    if (!result.rows[0]) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  })
  return { ok: true }
})
