// server/api/crm/targets/index.get.ts — list sales targets (optionally for a period).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listTargets } from '~~/server/utils/crm/targetsDb'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({
  client_id: z.string().uuid(),
  period_start: z.string().optional(),
  period_end: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const period = q.period_start && q.period_end ? { start: q.period_start, end: q.period_end } : undefined
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  return { items: await listTargets(context, period) }
})
