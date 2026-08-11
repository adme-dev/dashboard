// server/api/crm/people/[id].patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { validateCustomFields, type FieldDef } from '~~/server/utils/crm/customFields'
import { recordFieldChanges } from '~~/server/utils/crm/audit'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireAllCrmRecordsAccess, requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'

const AUDIT_COLS = ['company_id', 'first_name', 'last_name', 'email', 'phone', 'mobile', 'job_title', 'department', 'city', 'notes', 'lifecycle_stage', 'tags', 'owner_id', 'assigned_to', 'do_not_contact', 'do_not_email', 'do_not_call', 'do_not_sms', 'preferred_channel', 'best_time'] as const

const Body = z.object({
  client_id: z.string().uuid(),
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
  owner_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  // F10 contact preferences.
  do_not_contact: z.boolean().optional(),
  do_not_email: z.boolean().optional(),
  do_not_call: z.boolean().optional(),
  do_not_sms: z.boolean().optional(),
  preferred_channel: z.string().nullable().optional(),
  best_time: z.string().nullable().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const { before, row } = await transaction(async (db) => {
    const current = await requireCrmRecordAccess(context, { type: 'person', id: id as string }, db)
    await requireAllCrmRecordsAccess(
      context,
      b.company_id ? [{ type: 'company', id: b.company_id }] : [],
      db
    )
    const sets: string[] = []
    const params: unknown[] = []
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
    for (const col of AUDIT_COLS) {
      if (b[col] !== undefined) set(col, b[col])
    }
    if (b.custom_fields !== undefined) {
      const defsResult = await db.query(
        `SELECT key, field_type, options FROM crm_custom_fields WHERE client_id = $1 AND object_type = 'person'`,
        [context.clientId]
      )
      let cf: Record<string, unknown>
      try { cf = validateCustomFields(defsResult.rows as FieldDef[], b.custom_fields) }
      catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message }) }
      params.push(JSON.stringify(cf)); sets.push(`custom_fields = $${params.length}::jsonb`)
    }
    if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    sets.push('updated_at = NOW()')
    params.push(id); const idIdx = params.length
    params.push(context.clientId); const clientIdx = params.length
    const updated = await db.query(
      `UPDATE crm_people SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`,
      params
    )
    if (!updated.rows[0]) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    return { before: current.row, row: updated.rows[0] }
  })
  try {
    await recordFieldChanges({ clientId: context.clientId, entityType: 'person', entityId: id as string, before, after: row, fields: [...AUDIT_COLS], actor: context.actorId })
  } catch (e) { console.error('[crm] audit failed', e) }
  return { item: row }
})
