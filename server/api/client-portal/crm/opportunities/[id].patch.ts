// server/api/client-portal/crm/opportunities/[id].patch.ts — session-scoped.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'
import { recordFieldChanges } from '~~/server/utils/crm/audit'

const AUDIT_COLS = ['name', 'person_id', 'company_id', 'amount', 'probability', 'expected_close_date', 'source', 'competitor', 'lost_reason', 'notes', 'next_action', 'next_action_date'] as const

const Body = z.object({
  name: z.string().min(1).optional(),
  person_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().optional(),
  probability: z.coerce.number().int().min(0).max(100).optional(),
  expected_close_date: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  competitor: z.string().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  next_action_date: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const before = await queryOne<Record<string, unknown>>(
    `SELECT * FROM crm_opportunities WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`, [id, client.clientId])
  const sets: string[] = []
  const params: unknown[] = []
  const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
  for (const col of AUDIT_COLS) {
    if (b[col] !== undefined) set(col, b[col])
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')
  params.push(id); const idIdx = params.length
  params.push(client.clientId); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_opportunities SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`, params)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Opportunity not found' })
  try {
    await recordFieldChanges({ clientId: client.clientId, entityType: 'opportunity', entityId: id as string, before, after: row, fields: [...AUDIT_COLS], actor: client.id })
  } catch (e) { console.error('[crm] audit failed', e) }
  return { item: row }
})
