import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  // A job can emit several invocation events, each carrying a cost. Count the
  // canonical job once and retain NULL when no actual has been recorded.
  return queryRows<{
    payer: 'agency' | 'tenant'
    attributionId: string
    client: string
    jobs: number
    estimatedCents: number
    actualCents: number | null
    reportedJobs: number
    openCents: number
  }>(`
    SELECT j.payer, j.tenant_id AS "attributionId",
           COALESCE(c.name, CASE WHEN j.tenant_id = 'agency' THEN 'Agency projects' ELSE j.tenant_id END) AS client,
           COUNT(*)::int AS jobs,
           SUM(j.estimated_cost_cents)::float8 AS "estimatedCents",
           SUM(j.actual_cost_cents)::float8 AS "actualCents",
           COUNT(j.actual_cost_cents)::int AS "reportedJobs",
           COALESCE(SUM(j.liability_cents) FILTER (WHERE j.liability_state IN ('reserved', 'uncertain')), 0)::float8 AS "openCents"
      FROM video_generation_jobs j
      LEFT JOIN agency_clients c ON c.id::text = j.tenant_id
     WHERE j.created_at >= NOW() - INTERVAL '30 days'
     GROUP BY j.payer, j.tenant_id, c.name
     ORDER BY j.payer, client, j.tenant_id
  `)
})
