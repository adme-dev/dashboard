// server/api/crm/activities/[id].patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'

const Body = z.object({
  client_id: z.string().uuid(),
  title: z.string().min(1).optional(),
  body: z.string().nullable().optional(),
  is_completed: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const row = await transaction(async (db) => {
    await requireCrmRecordAccess(context, { type: 'activity', id: id as string }, db)
    const sets: string[] = []
    const params: unknown[] = []
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
    if (b.title !== undefined) set('title', b.title)
    if (b.body !== undefined) set('body', b.body)
    if (b.is_completed !== undefined) {
      set('is_completed', b.is_completed)
      sets.push(`completed_at = ${b.is_completed ? 'NOW()' : 'NULL'}`)
    }
    if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    sets.push('updated_at = NOW()')
    params.push(id); const idIdx = params.length
    params.push(context.clientId); const clientIdx = params.length
    const updated = await db.query(
      `UPDATE crm_activities SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`,
      params
    )
    if (!updated.rows[0]) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    return updated.rows[0]
  })
  return { item: row }
})
