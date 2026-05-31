// server/api/crm/object-defs/[id]/field-defs/[fid].patch.ts — update a field (agency-only).
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  client_id: z.string().uuid(),
  label: z.string().min(1).optional(),
  options: z.array(z.string()).optional(),
  is_required: z.boolean().optional(),
  is_title: z.boolean().optional(),
  position: z.coerce.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const fid = getRouterParam(event, 'fid')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const sets: string[] = []
  const params: unknown[] = []
  const set = (frag: string, val: unknown) => { params.push(val); sets.push(frag.replace('?', `$${params.length}`)) }
  if (b.label !== undefined) set('label = ?', b.label)
  if (b.options !== undefined) set('options = ?::jsonb', JSON.stringify(b.options))
  if (b.is_required !== undefined) set('is_required = ?', b.is_required)
  if (b.is_title !== undefined) set('is_title = ?', b.is_title)
  if (b.position !== undefined) set('position = ?', b.position)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')
  params.push(fid); const fidIdx = params.length
  params.push(b.client_id); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_field_defs SET ${sets.join(', ')} WHERE id = $${fidIdx} AND client_id = $${clientIdx} RETURNING *`,
    params,
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Field not found' })
  return { item: row }
})
