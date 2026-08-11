// server/api/crm/tasks/[id].patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { TaskUpdateInput } from '~~/server/utils/crm/tasks'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'

const Body = TaskUpdateInput.extend({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const row = await transaction(async (db) => {
    await requireCrmRecordAccess(context, { type: 'task', id: id as string }, db)
    const sets: string[] = []
    const params: unknown[] = []
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
    if (b.title !== undefined) set('title', b.title)
    if (b.description !== undefined) set('description', b.description)
    if (b.task_type !== undefined) set('task_type', b.task_type)
    if (b.priority !== undefined) set('priority', b.priority)
    if (b.due_at !== undefined) set('due_at', b.due_at)
    if (b.reminder_at !== undefined) set('reminder_at', b.reminder_at)
    if (b.assigned_to !== undefined) set('assigned_to', b.assigned_to)
    if (b.outcome !== undefined) set('outcome', b.outcome)
    if (b.status !== undefined) {
      set('status', b.status)
      sets.push(`completed_at = ${b.status === 'completed' ? 'NOW()' : 'NULL'}`)
    }
    if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    sets.push('updated_at = NOW()')
    params.push(id); const idIdx = params.length
    params.push(context.clientId); const clientIdx = params.length
    const updated = await db.query(
      `UPDATE crm_tasks SET ${sets.join(', ')}
        WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`,
      params
    )
    if (!updated.rows[0]) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    return updated.rows[0]
  })
  return { item: row }
})
