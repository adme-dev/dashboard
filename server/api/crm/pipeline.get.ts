// server/api/crm/pipeline.get.ts
// Per-stage rollup (open opportunities only): count, sum(amount), sum(weighted_value).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'
import { buildWhere, visibilityCondsForContext } from '~~/server/utils/crm/queryScope'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: client_id, surface: 'agency_global' })
  const { where, params } = buildWhere(context.clientId, [
    ...visibilityCondsForContext(context, 'opportunity', 'crm_opportunities'),
    { sql: "crm_opportunities.status = ?", params: ['open'] }
  ])
  const rows = await queryRows<{ stage_id: string, count: string, total: string, weighted: string }>(
    `SELECT stage_id,
            COUNT(*)::text AS count,
            COALESCE(SUM(amount),0)::text AS total,
            COALESCE(SUM(weighted_value),0)::text AS weighted
       FROM crm_opportunities ${where}
      GROUP BY stage_id`,
    params,
  )
  const byStage = Object.fromEntries(rows.map(r => [r.stage_id, {
    count: Number(r.count), total: Number(r.total), weighted: Number(r.weighted),
  }]))
  const openTotal = rows.reduce((s, r) => s + Number(r.total), 0)
  const weightedTotal = rows.reduce((s, r) => s + Number(r.weighted), 0)
  return { byStage, openTotal, weightedTotal }
})
