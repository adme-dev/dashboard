import { requireAuth } from '~~/server/utils/auth'
import { execute, queryRows } from '~~/server/utils/db'
import { enqueueLeadJob } from '~~/server/utils/leads/queue'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const failed = await queryRows<{ id: string }>(
    `SELECT id FROM lead_deliveries WHERE lead_id = $1 AND status = 'failed'`,
    [id],
  )
  if (failed.length === 0) return { ok: true, retried: 0 }
  await execute(
    `UPDATE lead_deliveries
     SET status = 'pending', retry_count = 0, last_error = NULL,
         scheduled_at = NOW(), claimed_at = NULL, claimed_by = NULL, updated_at = NOW()
     WHERE lead_id = $1 AND status = 'failed'`,
    [id],
  )
  for (const d of failed) {
    await enqueueLeadJob({ type: 'delivery.dispatch', payload: { delivery_id: d.id } })
  }
  return { ok: true, retried: failed.length }
})
