// server/api/crm/communications/index.get.ts — unified timeline for a target.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listTimeline } from '~~/server/utils/crm/commsDb'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({
  client_id: z.string().uuid(),
  target: z.enum(['person', 'company']),
  target_id: z.string().uuid(),
  channel: z.enum(['email', 'call', 'sms', 'meeting', 'note']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  const items = await listTimeline(context, q.target, q.target_id, { channel: q.channel, limit: q.limit })
  return { items }
})
