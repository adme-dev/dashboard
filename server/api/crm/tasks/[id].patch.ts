// server/api/crm/tasks/[id].patch.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { TaskUpdateInput } from '~~/server/utils/crm/tasks'

const Body = TaskUpdateInput.extend({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data

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
    // Stamp/clear completion time to match the status transition.
    sets.push(`completed_at = ${b.status === 'completed' ? 'NOW()' : 'NULL'}`)
  }

  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')

  params.push(id); const idIdx = params.length
  params.push(b.client_id); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_tasks SET ${sets.join(', ')}
      WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`,
    params,
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  return { item: row }
})
