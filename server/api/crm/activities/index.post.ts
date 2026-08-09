// server/api/crm/activities/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { recomputeIfScorable } from '~~/server/utils/crm/scoreSignals'
import { recomputeHealthIfCustomer } from '~~/server/utils/crm/healthSignals'
import { applyLifecycleEvent } from '~~/server/utils/crm/lifecycle'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { requireCrmRecordAccess } from '~~/server/utils/crm/recordAccess'

const Body = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['person', 'company', 'opportunity']),
  target_id: z.string().uuid(),
  type: z.enum(['note', 'call', 'email', 'meeting', 'task', 'stage_change', 'system']).default('note'),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  scheduled_at: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const context = await resolveAgencyCrmSearchContext(event, { clientId: b.client_id, surface: 'agency_global' })
  const row = await transaction(async (db) => {
    await requireCrmRecordAccess(context, { type: b.target_type, id: b.target_id }, db)
    const result = await db.query(
      `INSERT INTO crm_activities (client_id, target_type, target_id, type, title, body, scheduled_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [context.clientId, b.target_type, b.target_id, b.type, b.title, b.body ?? null, b.scheduled_at ?? null, context.actorId]
    )
    return result.rows[0]
  })
  // Logging activity bumps the contact's engagement + recency score.
  await recomputeIfScorable(context.clientId, b.target_type, b.target_id, 'activity')
  // For customers, the same touch refreshes the health/churn score in-band.
  await recomputeHealthIfCustomer(context.clientId, b.target_type, b.target_id, 'activity')
  // First touch sets a contact to `lead` (and revives dormant). Best-effort.
  if (b.target_type === 'person' || b.target_type === 'company') {
    try {
      await applyLifecycleEvent({ clientId: context.clientId, entityType: b.target_type, entityId: b.target_id, event: 'activity_logged' })
    } catch (e) {
      console.error('[crm] lifecycle activity hook failed', e)
    }
  }
  return { item: row }
})
