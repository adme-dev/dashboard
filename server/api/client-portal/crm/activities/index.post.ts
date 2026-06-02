// server/api/client-portal/crm/activities/index.post.ts — session-scoped.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'
import { recomputeIfScorable } from '~~/server/utils/crm/scoreSignals'
import { recomputeHealthIfCustomer } from '~~/server/utils/crm/healthSignals'
import { applyLifecycleEvent } from '~~/server/utils/crm/lifecycle'

const Body = z.object({
  target_type: z.enum(['person', 'company', 'opportunity']),
  target_id: z.string().uuid(),
  type: z.enum(['note', 'call', 'email', 'meeting', 'task', 'stage_change', 'system']).default('note'),
  title: z.string().min(1),
  body: z.string().nullable().optional(),
  scheduled_at: z.string().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const row = await queryOne(
    `INSERT INTO crm_activities (client_id, target_type, target_id, type, title, body, scheduled_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [client.clientId, b.target_type, b.target_id, b.type, b.title, b.body ?? null, b.scheduled_at ?? null, client.id],
  )
  await recomputeIfScorable(client.clientId, b.target_type, b.target_id, 'activity')
  await recomputeHealthIfCustomer(client.clientId, b.target_type, b.target_id, 'activity')
  // First touch sets a contact to `lead` (and revives dormant). Best-effort.
  if (b.target_type === 'person' || b.target_type === 'company') {
    try {
      await applyLifecycleEvent({ clientId: client.clientId, entityType: b.target_type, entityId: b.target_id, event: 'activity_logged' })
    } catch (e) {
      console.error('[crm] lifecycle activity hook failed', e)
    }
  }
  return { item: row }
})
