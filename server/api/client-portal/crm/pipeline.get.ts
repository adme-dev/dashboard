// server/api/client-portal/crm/pipeline.get.ts — session-scoped.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const rows = await queryRows<{ stage_id: string, count: string, total: string, weighted: string }>(
    `SELECT stage_id,
            COUNT(*)::text AS count,
            COALESCE(SUM(amount),0)::text AS total,
            COALESCE(SUM(weighted_value),0)::text AS weighted
       FROM crm_opportunities
      WHERE client_id = $1 AND deleted_at IS NULL AND status = 'open'
      GROUP BY stage_id`,
    [client.clientId],
  )
  const byStage = Object.fromEntries(rows.map(r => [r.stage_id, {
    count: Number(r.count), total: Number(r.total), weighted: Number(r.weighted),
  }]))
  const openTotal = rows.reduce((s, r) => s + Number(r.total), 0)
  const weightedTotal = rows.reduce((s, r) => s + Number(r.weighted), 0)
  return { byStage, openTotal, weightedTotal }
})
