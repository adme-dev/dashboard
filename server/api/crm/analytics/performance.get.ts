// server/api/crm/analytics/performance.get.ts
// Per-owner pipeline metrics. Owner display names land with the F15 leaderboard
// (Phase 3); for now rows are keyed by owner_id.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { winRate, weightedForecast, type AnalyticsOpp } from '~~/server/utils/crm/analytics'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
  const opps = await queryRows<AnalyticsOpp>(
    `SELECT id, stage_id, amount, probability, status, owner_id, created_at, actual_close_date
       FROM crm_opportunities WHERE client_id = $1 AND deleted_at IS NULL`,
    [client_id],
  )

  const byOwner = new Map<string, AnalyticsOpp[]>()
  for (const o of opps) {
    const key = o.owner_id ?? '—'
    const arr = byOwner.get(key) ?? []
    arr.push(o)
    byOwner.set(key, arr)
  }

  const items = [...byOwner.entries()].map(([owner_id, list]) => {
    const wr = winRate(list)
    const wonValue = list.filter(o => o.status === 'won').reduce((s, o) => s + Number(o.amount || 0), 0)
    return {
      owner_id: owner_id === '—' ? null : owner_id,
      count: list.length,
      won: wr.won,
      lost: wr.lost,
      open: wr.open,
      winRate: wr.winRate,
      weightedForecast: weightedForecast(list),
      wonValue,
    }
  }).sort((a, b) => b.weightedForecast - a.weightedForecast)

  return { items }
})
