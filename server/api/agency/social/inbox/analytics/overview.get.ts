import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/**
 * GET /api/agency/social/inbox/analytics/overview?clientId=&days=30
 * Response-time, SLA, volume and automation-rate metrics for the client's conversations in the window.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const days = Math.min(Math.max(Number(q.days) || 30, 1), 365)

  const row = await queryOne<any>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
       COUNT(*) FILTER (WHERE first_response_at IS NOT NULL)::int AS responded,
       COUNT(*) FILTER (WHERE sla_due_at IS NOT NULL)::int AS sla_tracked,
       COUNT(*) FILTER (WHERE sla_breached = TRUE)::int AS breaches,
       COUNT(*) FILTER (WHERE first_response_at IS NOT NULL AND (sla_due_at IS NULL OR first_response_at <= sla_due_at))::int AS within_sla,
       COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60.0) FILTER (WHERE first_response_at IS NOT NULL))::int, 0) AS avg_first_response_minutes
     FROM social_conversations
     WHERE client_id = $1 AND created_at > NOW() - MAKE_INTERVAL(days => $2)`,
    [clientId, days])

  const automation = await queryOne<{ auto: number; sent: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE effective_mode = 'autopilot' AND status = 'sent')::int AS auto,
       COUNT(*)::int AS sent
     FROM social_response_queue
     WHERE client_id = $1 AND created_at > NOW() - MAKE_INTERVAL(days => $2)`,
    [clientId, days]).catch(() => ({ auto: 0, sent: 0 }))

  const slaTracked = row?.sla_tracked || 0
  return {
    total: row?.total || 0,
    open: row?.open_count || 0,
    responded: row?.responded || 0,
    avgFirstResponseMinutes: row?.avg_first_response_minutes || 0,
    slaTracked,
    breaches: row?.breaches || 0,
    withinSlaPct: slaTracked ? Math.round(((row?.within_sla || 0) / slaTracked) * 100) : null,
    automationRatePct: automation?.sent ? Math.round((automation.auto / automation.sent) * 100) : 0,
  }
})
