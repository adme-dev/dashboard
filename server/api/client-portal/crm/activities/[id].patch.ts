// server/api/client-portal/crm/activities/[id].patch.ts — session-scoped.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  title: z.string().min(1).optional(),
  body: z.string().nullable().optional(),
  is_completed: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
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
  params.push(client.clientId); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_activities SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`, params)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Activity not found' })
  return { item: row }
})
