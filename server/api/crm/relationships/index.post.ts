// server/api/crm/relationships/index.post.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { assertEndpointsExist, assertNoHierarchyCycle } from '~~/server/utils/crm/relationshipsDb'

const Body = z.object({
  client_id: z.string().uuid(),
  from_type: z.enum(['person', 'company']),
  from_id: z.string().uuid(),
  to_type: z.enum(['person', 'company']),
  to_id: z.string().uuid(),
  relationship_type: z.string().min(1),
  is_decision_maker: z.boolean().default(false),
  is_primary_contact: z.boolean().default(false),
  notes: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  if (b.from_type === b.to_type && b.from_id === b.to_id) {
    throw createError({ statusCode: 400, statusMessage: 'A record cannot relate to itself' })
  }
  await assertEndpointsExist(b.client_id, b.from_type, b.from_id, b.to_type, b.to_id)
  await assertNoHierarchyCycle(b.client_id, b.from_type, b.from_id, b.to_type, b.to_id, b.relationship_type)
  const row = await queryOne(
    `INSERT INTO crm_relationships
       (client_id, from_type, from_id, to_type, to_id, relationship_type, is_decision_maker, is_primary_contact, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (client_id, from_type, from_id, to_type, to_id, relationship_type)
       DO UPDATE SET is_decision_maker = EXCLUDED.is_decision_maker,
                     is_primary_contact = EXCLUDED.is_primary_contact, notes = EXCLUDED.notes
     RETURNING *`,
    [b.client_id, b.from_type, b.from_id, b.to_type, b.to_id, b.relationship_type, b.is_decision_maker, b.is_primary_contact, b.notes ?? null, user.id],
  )
  return { item: row }
})
