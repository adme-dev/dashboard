// server/api/client-portal/crm/people/[id].patch.ts — session-scoped.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { validateCustomFields, type FieldDef } from '~~/server/utils/crm/customFields'

const Body = z.object({
  company_id: z.string().uuid().nullable().optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lifecycle_stage: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
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
  for (const col of ['company_id', 'first_name', 'last_name', 'email', 'phone', 'mobile', 'job_title', 'department', 'city', 'notes', 'lifecycle_stage', 'tags'] as const) {
    if (b[col] !== undefined) set(col, b[col])
  }
  if (b.custom_fields !== undefined) {
    const defs = await queryRows<FieldDef>(
      `SELECT key, field_type, options FROM crm_custom_fields WHERE client_id = $1 AND object_type = 'person'`, [client.clientId])
    let cf: Record<string, unknown>
    try { cf = validateCustomFields(defs, b.custom_fields) }
    catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message }) }
    params.push(JSON.stringify(cf)); sets.push(`custom_fields = $${params.length}::jsonb`)
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')
  params.push(id); const idIdx = params.length
  params.push(client.clientId); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_people SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`, params)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  return { item: row }
})
