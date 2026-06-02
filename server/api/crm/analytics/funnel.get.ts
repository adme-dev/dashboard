// server/api/crm/analytics/funnel.get.ts
// P4.0c — thin wrapper resolving the F4 endpoint drift (was 404). Returns just
// the pipeline funnel; /api/crm/analytics/summary returns this plus win-rate,
// forecast and cycle-time in one call. Agency-only.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { funnel, type AnalyticsOpp, type AnalyticsStage } from '~~/server/utils/crm/analytics'

const Query = z.object({
  client_id: z.string().uuid(),
  from: z.string().optional(),
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
    `SELECT id, stage_id, amount, probability, status, owner_id,
            created_at::date::text AS created_at, actual_close_date::text AS actual_close_date
       FROM crm_opportunities WHERE ${conds.join(' AND ')}`,
    params,
  )

  return { funnel: funnel(opps, stages) }
})
