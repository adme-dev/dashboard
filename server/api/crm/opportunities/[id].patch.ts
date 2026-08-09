// server/api/crm/opportunities/[id].patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { recordFieldChanges } from '~~/server/utils/crm/audit'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireAllCrmRecordsAccess, requireCrmRecordAccess, type CrmRecordRef } from '~~/server/utils/crm/recordAccess'

const AUDIT_COLS = ['name', 'person_id', 'company_id', 'owner_id', 'assigned_to', 'amount', 'probability', 'expected_close_date', 'source', 'competitor', 'lost_reason', 'notes', 'next_action', 'next_action_date', 'quote_id'] as const

const Body = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1).optional(),
  person_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expected_close_date: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  competitor: z.string().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  next_action_date: z.string().nullable().optional(),
  // F14 quote link.
  quote_id: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const refs: CrmRecordRef[] = []
  if (b.person_id) refs.push({ type: 'person', id: b.person_id })
  if (b.company_id) refs.push({ type: 'company', id: b.company_id })
  const { before, row } = await transaction(async (db) => {
    const current = await requireCrmRecordAccess(context, { type: 'opportunity', id: id as string }, db)
    await requireAllCrmRecordsAccess(context, refs, db)
    const sets: string[] = []
    const params: unknown[] = []
    const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
    for (const col of AUDIT_COLS) {
      if (b[col] !== undefined) set(col, b[col])
    }
    if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
    sets.push('updated_at = NOW()')
    params.push(id); const idIdx = params.length
    params.push(context.clientId); const clientIdx = params.length
    const updated = await db.query(
      `UPDATE crm_opportunities SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`,
      params
    )
    if (!updated.rows[0]) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
    return { before: current.row, row: updated.rows[0] }
  })
  try {
    await recordFieldChanges({ clientId: context.clientId, entityType: 'opportunity', entityId: id as string, before, after: row, fields: [...AUDIT_COLS], actor: context.actorId })
  } catch (e) { console.error('[crm] audit failed', e) }
  return { item: row }
})
