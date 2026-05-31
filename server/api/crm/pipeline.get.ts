// server/api/crm/pipeline.get.ts
// Per-stage rollup (open opportunities only): count, sum(amount), sum(weighted_value).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
  const rows = await queryRows<{ stage_id: string, count: string, total: string, weighted: string }>(
    `SELECT stage_id,
            COUNT(*)::text AS count,
            COALESCE(SUM(amount),0)::text AS total,
            COALESCE(SUM(weighted_value),0)::text AS weighted
       FROM crm_opportunities
      WHERE client_id = $1 AND deleted_at IS NULL AND status = 'open'
      GROUP BY stage_id`,
    [client_id],
  )
  const byStage = Object.fromEntries(rows.map(r => [r.stage_id, {
    count: Number(r.count), total: Number(r.total), weighted: Number(r.weighted),
  }]))
  const openTotal = rows.reduce((s, r) => s + Number(r.total), 0)
  const weightedTotal = rows.reduce((s, r) => s + Number(r.weighted), 0)
  return { byStage, openTotal, weightedTotal }
})
