import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const Body = z.object({
  status: z.enum(['new', 'contacted', 'qualified', 'won', 'lost', 'spam_suspected']).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
}).refine(b => Object.keys(b).length > 0, { message: 'no fields' })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = Body.parse(await readBody(event))

  const sets: string[] = []
  const params: any[] = []
  const set = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`) }

  if (body.status) set('status', body.status)
  if ('assigned_to' in body) set('assigned_to', body.assigned_to)
  if ('notes' in body) set('notes', body.notes)
  if (body.status === 'contacted') {
    params.push(user.id)
    sets.push(`contacted_by = $${params.length}`)
    sets.push(`contacted_at = NOW()`)
  }
  params.push(id)
  const n = await execute(
    `UPDATE leads SET ${sets.join(', ')} WHERE id = $${params.length} AND deleted_at IS NULL`,
    params,
  )
  if (!n) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { ok: true }
})
