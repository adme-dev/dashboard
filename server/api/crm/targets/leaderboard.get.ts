// server/api/crm/targets/leaderboard.get.ts — per-rep target-vs-actual for a window.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { getLeaderboard } from '~~/server/utils/crm/targetsDb'

const Query = z.object({
  client_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  return { rows: await getLeaderboard(q.client_id, q.period_start, q.period_end) }
})
