// server/api/crm/targets/leaderboard.get.ts — per-rep target-vs-actual for a window.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { getLeaderboard } from '~~/server/utils/crm/targetsDb'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({
  client_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })
  return { rows: await getLeaderboard(context, q.period_start, q.period_end) }
})
