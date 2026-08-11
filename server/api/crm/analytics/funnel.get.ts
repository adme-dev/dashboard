// server/api/crm/analytics/funnel.get.ts
// P4.0c — thin wrapper resolving the F4 endpoint drift (was 404). Returns just
// the pipeline funnel; /api/crm/analytics/summary returns this plus win-rate,
// forecast and cycle-time in one call. Agency-only.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { funnel, type AnalyticsOpp, type AnalyticsStage } from '~~/server/utils/crm/analytics'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { buildWhere, visibilityCondsForContext, type Cond } from '~~/server/utils/crm/queryScope'

const Query = z.object({
  client_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  owner_id: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: q.client_id, surface: 'agency_global' })

  const stages = await queryRows<AnalyticsStage>(
    `SELECT id, code, name, sort_order, is_won, is_lost FROM crm_stages
      WHERE client_id IS NULL OR client_id = $1`,
    [context.clientId],
  )

  const conds: Cond[] = [...visibilityCondsForContext(context, 'opportunity', 'crm_opportunities')]
  if (q.from) conds.push({ sql: 'crm_opportunities.created_at >= ?', params: [q.from] })
  if (q.to) conds.push({ sql: 'crm_opportunities.created_at <= ?', params: [q.to] })
  if (q.owner_id) conds.push({ sql: 'crm_opportunities.owner_id = ?', params: [q.owner_id] })
  const { where, params } = buildWhere(context.clientId, conds)

  const opps = await queryRows<AnalyticsOpp>(
    `SELECT id, stage_id, amount, probability, status, owner_id,
            created_at::date::text AS created_at, actual_close_date::text AS actual_close_date
       FROM crm_opportunities ${where}`,
    params,
  )

  return { funnel: funnel(opps, stages) }
})
