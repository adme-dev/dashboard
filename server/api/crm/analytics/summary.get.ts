// server/api/crm/analytics/summary.get.ts
// Pipeline funnel + win rate + weighted forecast + cycle-time for the Insights tab.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import {
  funnel, winRate, weightedForecast, avgCycleLengthDays, avgTimeInStageDays,
  type AnalyticsOpp, type AnalyticsStage, type StageHistoryRow,
} from '~~/server/utils/crm/analytics'

const Query = z.object({
  client_id: z.string().uuid(),
  from: z.string().optional(), // ISO date — filters on created_at
  to: z.string().optional(),
  owner_id: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))

  const stages = await queryRows<AnalyticsStage>(
    `SELECT id, code, name, sort_order, is_won, is_lost FROM crm_stages
      WHERE client_id IS NULL OR client_id = $1`,
    [q.client_id],
  )

  const conds: string[] = ['client_id = $1', 'deleted_at IS NULL']
  const params: unknown[] = [q.client_id]
  if (q.from) { params.push(q.from); conds.push(`created_at >= $${params.length}`) }
  if (q.to) { params.push(q.to); conds.push(`created_at <= $${params.length}`) }
  if (q.owner_id) { params.push(q.owner_id); conds.push(`owner_id = $${params.length}`) }
  const opps = await queryRows<AnalyticsOpp>(
    // Cast dates to UTC date-only text so cycle-length is exact and identical across
    // drivers (pg returns DATE as a local-midnight Date; neon-http as a string).
    `SELECT id, stage_id, amount, probability, status, owner_id,
            created_at::date::text AS created_at, actual_close_date::text AS actual_close_date
       FROM crm_opportunities WHERE ${conds.join(' AND ')}`,
    params,
  )

  const history = await queryRows<StageHistoryRow>(
    `SELECT opportunity_id, from_stage_id, to_stage_id, changed_at
       FROM crm_opportunity_stage_history WHERE client_id = $1`,
    [q.client_id],
  )

  const openPipelineValue = opps
    .filter(o => o.status === 'open')
    .reduce((s, o) => s + Number(o.amount || 0), 0)

  return {
    counts: { total: opps.length },
    funnel: funnel(opps, stages),
    winRate: winRate(opps),
    weightedForecast: weightedForecast(opps),
    openPipelineValue,
    avgCycleDays: avgCycleLengthDays(opps),
    timeInStage: avgTimeInStageDays(history),
  }
})
