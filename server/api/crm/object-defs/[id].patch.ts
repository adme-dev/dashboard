// server/api/crm/object-defs/[id].patch.ts — update a config object (agency-only).
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  client_id: z.string().uuid(),
  label: z.string().min(1).optional(),
  label_plural: z.string().min(1).optional(),
  icon: z.string().nullable().optional(),
  has_pipeline: z.boolean().optional(),
  position: z.coerce.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const sets: string[] = []
  const params: unknown[] = []
  const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
  for (const col of ['label', 'label_plural', 'icon', 'has_pipeline', 'position'] as const) {
    if (b[col] !== undefined) set(col, b[col])
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')
  params.push(id); const idIdx = params.length
  params.push(b.client_id); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_object_defs SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`,
    params,
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Object not found' })
  return { item: row }
})
