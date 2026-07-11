import { setHeader } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store')
  await requireRole(event, ['admin', 'owner'])
  const counts = await queryRows<{ status: string; count: number }>(`SELECT status, COUNT(*)::int AS count FROM monday_webhook_events GROUP BY status ORDER BY status`)
  const recentFailures = await queryRows(`SELECT monday_event_id AS "eventId", event_type AS "eventType", error_message AS error, received_at AS "receivedAt" FROM monday_webhook_events WHERE status = 'failed' ORDER BY received_at DESC LIMIT 20`)
  return { counts, recentFailures }
})
