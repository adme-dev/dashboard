// server/api/client-portal/crm/opportunities/index.post.ts — session-scoped.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'
import { applyLifecycleEvent } from '~~/server/utils/crm/lifecycle'

const Body = z.object({
  name: z.string().min(1),
  stage_id: z.string().uuid(),
  person_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().optional().default(0),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expected_close_date: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const stage = await queryOne<{ id: string, probability: number, is_won: boolean, is_lost: boolean }>(
    `SELECT id, probability, is_won, is_lost FROM crm_stages WHERE id = $1 AND (client_id IS NULL OR client_id = $2)`,
    [b.stage_id, client.clientId],
  )
  if (!stage) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  const status = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open'
  const prob = b.probability ?? stage.probability
  const row = await queryOne(
    `INSERT INTO crm_opportunities
       (client_id, name, person_id, company_id, stage_id, amount, probability, expected_close_date, status, source, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [client.clientId, b.name, b.person_id ?? null, b.company_id ?? null, b.stage_id,
      b.amount ?? 0, prob, b.expected_close_date ?? null, status, b.source ?? null, b.notes ?? null, client.id],
  )
  // Opening a deal advances the linked contact(s) to `prospect` (or `customer` if
  // created straight into a won stage). Best-effort — never fail the create.
  try {
    const ev = status === 'won' ? 'opportunity_won' : 'opportunity_created'
    await applyLifecycleEvent({ clientId: client.clientId, entityType: 'person', entityId: b.person_id ?? null, event: ev })
    await applyLifecycleEvent({ clientId: client.clientId, entityType: 'company', entityId: b.company_id ?? null, event: ev })
  } catch (e) {
    console.error('[crm] lifecycle create hook failed', e)
  }
  return { item: row }
})
