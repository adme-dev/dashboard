// server/api/crm/scoring/index.get.ts
// Returns lead scores for a client's people or companies, keyed by target_id.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['person', 'company']),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const items = await queryRows(
    `SELECT target_id, total_score, grade, engagement_score, intent_score, fit_score, recency_score, computed_at
       FROM crm_scores
      WHERE client_id = $1 AND target_type = $2 AND score_type = 'lead'`,
    [q.client_id, q.target_type],
  )
  const byTarget: Record<string, typeof items[number]> = {}
  for (const it of items) byTarget[(it as { target_id: string }).target_id] = it
  return { items, byTarget }
})
