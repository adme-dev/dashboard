// server/api/crm/people/index.post.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { validateCustomFields, type FieldDef } from '~~/server/utils/crm/customFields'
import { autoAssignOnCreate } from '~~/server/utils/crm/assignment'

const Body = z.object({
  client_id: z.string().uuid(),
  company_id: z.string().uuid().nullable().optional(),
  first_name: z.string().min(1),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.string(), z.unknown()).optional().default({}),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const defs = await queryRows<FieldDef>(
    `SELECT key, field_type, options FROM crm_custom_fields WHERE client_id = $1 AND object_type = 'person'`,
    [b.client_id],
  )
  let cf: Record<string, unknown>
  try { cf = validateCustomFields(defs, b.custom_fields) }
  catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message }) }
  const row = await queryOne(
    `INSERT INTO crm_people
       (client_id, company_id, first_name, last_name, email, phone, mobile, job_title, department, city, notes, custom_fields, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
     RETURNING *`,
    [b.client_id, b.company_id ?? null, b.first_name, b.last_name ?? null, b.email ?? null,
      b.phone ?? null, b.mobile ?? null, b.job_title ?? null, b.department ?? null, b.city ?? null,
      b.notes ?? null, JSON.stringify(cf), user.id],
  )
  // Auto-assign to a rep if a rule is configured and no owner was set. Best-effort.
  try {
    const owner = await autoAssignOnCreate({ clientId: b.client_id, objectType: 'person', table: 'crm_people', recordId: (row as any).id, currentOwner: (row as any).owner_id })
    if (owner) { (row as any).owner_id = owner; (row as any).assigned_to = (row as any).assigned_to ?? owner }
  } catch (e) { console.error('[crm] auto-assign failed', e) }
  return { item: row }
})
