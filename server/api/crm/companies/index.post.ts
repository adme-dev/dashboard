// server/api/crm/companies/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { validateCustomFields, type FieldDef } from '~~/server/utils/crm/customFields'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Body = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1),
  domain: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  employees: z.coerce.number().int().optional().nullable(),
  address_line1: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  custom_fields: z.record(z.string(), z.unknown()).optional().default({}),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const row = await transaction(async (db) => {
    const defsResult = await db.query(
      `SELECT key, field_type, options FROM crm_custom_fields WHERE client_id = $1 AND object_type = 'company'`,
      [context.clientId]
    )
    let cf: Record<string, unknown>
    try { cf = validateCustomFields(defsResult.rows as FieldDef[], b.custom_fields) }
    catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message }) }
    const result = await db.query(
      `INSERT INTO crm_companies
         (client_id, name, domain, phone, employees, address_line1, city, state, postal_code, country, notes, custom_fields, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
       RETURNING *`,
      [context.clientId, b.name, b.domain ?? null, b.phone ?? null, b.employees ?? null,
        b.address_line1 ?? null, b.city ?? null, b.state ?? null, b.postal_code ?? null,
        b.country ?? 'AU', b.notes ?? null, JSON.stringify(cf), context.actorId]
    )
    return result.rows[0]
  })
  return { item: row }
})
