// server/api/crm/companies/[id].patch.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { validateCustomFields, type FieldDef } from '~~/server/utils/crm/customFields'
import { recordFieldChanges } from '~~/server/utils/crm/audit'

const AUDIT_COLS = ['name', 'domain', 'phone', 'employees', 'address_line1', 'city', 'state', 'postal_code', 'country', 'notes', 'lifecycle_stage', 'tags', 'owner_id', 'assigned_to'] as const

const Body = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1).optional(),
  domain: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  employees: z.coerce.number().int().nullable().optional(),
  address_line1: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lifecycle_stage: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  owner_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data

  const before = await queryOne<Record<string, unknown>>(
    `SELECT * FROM crm_companies WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`, [id, b.client_id])
  const sets: string[] = []
  const params: unknown[] = []
  const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }

  for (const col of AUDIT_COLS) {
    if (b[col] !== undefined) set(col, b[col])
  }
  if (b.custom_fields !== undefined) {
    const defs = await queryRows<FieldDef>(
      `SELECT key, field_type, options FROM crm_custom_fields WHERE client_id = $1 AND object_type = 'company'`,
      [b.client_id],
    )
    let cf: Record<string, unknown>
    try { cf = validateCustomFields(defs, b.custom_fields) }
    catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message }) }
    params.push(JSON.stringify(cf)); sets.push(`custom_fields = $${params.length}::jsonb`)
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')

  params.push(id); const idIdx = params.length
  params.push(b.client_id); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_companies SET ${sets.join(', ')}
     WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL
     RETURNING *`,
    params,
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Company not found' })
  try {
    await recordFieldChanges({ clientId: b.client_id, entityType: 'company', entityId: id as string, before, after: row, fields: [...AUDIT_COLS], actor: user.id })
  } catch (e) { console.error('[crm] audit failed', e) }
  return { item: row }
})
