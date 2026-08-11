// server/api/crm/opportunities/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { applyLifecycleEvent } from '~~/server/utils/crm/lifecycle'
import { autoAssignOnCreate } from '~~/server/utils/crm/assignment'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireAllCrmRecordsAccess, type CrmRecordRef } from '~~/server/utils/crm/recordAccess'

const Body = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1),
  stage_id: z.string().uuid(),
  person_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().optional().default(0),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expected_close_date: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const refs: CrmRecordRef[] = []
  if (b.person_id) refs.push({ type: 'person', id: b.person_id })
  if (b.company_id) refs.push({ type: 'company', id: b.company_id })
  const { row, status } = await transaction(async (db) => {
    await requireAllCrmRecordsAccess(context, refs, db)
    const stageResult = await db.query(
      `SELECT id, probability, is_won, is_lost FROM crm_stages WHERE id = $1 AND (client_id IS NULL OR client_id = $2)`,
      [b.stage_id, context.clientId]
    )
    const stage = stageResult.rows[0] as { probability: number, is_won: boolean, is_lost: boolean } | undefined
    if (!stage) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
    const status = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open'
    const probability = b.probability ?? stage.probability
    const insertResult = await db.query(
      `INSERT INTO crm_opportunities
         (client_id, name, person_id, company_id, stage_id, owner_id, amount, probability, expected_close_date, status, source, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [context.clientId, b.name, b.person_id ?? null, b.company_id ?? null, b.stage_id, b.owner_id ?? null,
        b.amount ?? 0, probability, b.expected_close_date ?? null, status, b.source ?? null, b.notes ?? null, context.actorId]
    )
    return { row: insertResult.rows[0], status }
  })
  // Opening a deal advances the linked contact(s) to `prospect` (or `customer` if
  // created straight into a won stage). Best-effort — never fail the create.
  try {
    const ev = status === 'won' ? 'opportunity_won' : 'opportunity_created'
    await applyLifecycleEvent({ clientId: context.clientId, entityType: 'person', entityId: b.person_id ?? null, event: ev, context })
    await applyLifecycleEvent({ clientId: context.clientId, entityType: 'company', entityId: b.company_id ?? null, event: ev, context })
  } catch (e) {
    console.error('[crm] lifecycle create hook failed', e)
  }
  try {
    const owner = await autoAssignOnCreate({ clientId: context.clientId, objectType: 'opportunity', table: 'crm_opportunities', recordId: (row as any).id, currentOwner: (row as any).owner_id })
    if (owner) { (row as any).owner_id = owner; (row as any).assigned_to = (row as any).assigned_to ?? owner }
  } catch (e) { console.error('[crm] auto-assign failed', e) }
  return { item: row }
})
