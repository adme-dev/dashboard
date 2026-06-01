// server/api/client-portal/crm/communications/index.get.ts — session-scoped timeline.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { listTimeline } from '~~/server/utils/crm/commsDb'

const Query = z.object({
  target: z.enum(['person', 'company']),
  target_id: z.string().uuid(),
  channel: z.enum(['email', 'call', 'sms', 'meeting', 'note']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  const items = await listTimeline(client.clientId, q.target, q.target_id, { channel: q.channel, limit: q.limit })
  return { items }
})
