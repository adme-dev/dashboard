// server/api/crm/analytics/forecast.get.ts
// P4.0c — thin wrapper resolving the F4 endpoint drift (was 404). Returns just
// the probability-weighted forecast + open pipeline value; the same numbers are
// included in /api/crm/analytics/summary. Agency-only.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { weightedForecast, type AnalyticsOpp } from '~~/server/utils/crm/analytics'

const Query = z.object({
  client_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  owner_id: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))

  const conds: string[] = ['client_id = $1', 'deleted_at IS NULL']
  const params: unknown[] = [q.client_id]
  if (q.from) { params.push(q.from); conds.push(`created_at >= $${params.length}`) }
  if (q.to) { params.push(q.to); conds.push(`created_at <= $${params.length}`) }
  if (q.owner_id) { params.push(q.owner_id); conds.push(`owner_id = $${params.length}`) }

  const opps = await queryRows<AnalyticsOpp>(
    `SELECT id, stage_id, amount, probability, status, owner_id,
            created_at::date::text AS created_at, actual_close_date::text AS actual_close_date
       FROM crm_opportunities WHERE ${conds.join(' AND ')}`,
    params,
  )

  const openPipelineValue = opps
    .filter(o => o.status === 'open')
    .reduce((s, o) => s + Number(o.amount || 0), 0)

  return { weightedForecast: weightedForecast(opps), openPipelineValue }
})
