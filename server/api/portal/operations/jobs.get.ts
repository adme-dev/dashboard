import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  setHeader(event, 'Cache-Control', 'private, no-store')

  const summary = await queryOne(
    `SELECT
       COUNT(*) FILTER (WHERE enqueued_at >= NOW() - INTERVAL '24 hours') AS "total24h",
       COUNT(*) FILTER (
         WHERE completed_at >= NOW() - INTERVAL '24 hours' AND status = 'succeeded'
       ) AS "succeeded24h",
       COUNT(*) FILTER (WHERE status = 'queued') AS queued,
       COUNT(*) FILTER (WHERE status = 'running') AS running,
       COUNT(*) FILTER (WHERE status = 'retrying') AS retrying,
       COUNT(*) FILTER (WHERE status = 'dead_lettered') AS "deadLettered",
       MAX(EXTRACT(EPOCH FROM (NOW() - enqueued_at)))
         FILTER (WHERE status = 'queued') AS "oldestQueuedSeconds"
     FROM platform_jobs
    WHERE client_id = $1`,
    [client.clientId]
  )

  const recent = await queryRows(
    `SELECT id, job_type AS "jobType", status,
            attempt_count AS "attemptCount", max_attempts AS "maxAttempts",
            enqueued_at AS "enqueuedAt", updated_at AS "updatedAt"
       FROM platform_jobs
      WHERE client_id = $1
      ORDER BY updated_at DESC
      LIMIT 20`,
    [client.clientId]
  )

  const oldestQueuedSeconds = Number(summary?.oldestQueuedSeconds ?? 0)
  const deadLettered = Number(summary?.deadLettered ?? 0)
  return {
    generatedAt: new Date().toISOString(),
    healthy: oldestQueuedSeconds <= 300 && deadLettered === 0,
    metrics: {
      total24h: Number(summary?.total24h ?? 0),
      succeeded24h: Number(summary?.succeeded24h ?? 0),
      queued: Number(summary?.queued ?? 0),
      running: Number(summary?.running ?? 0),
      retrying: Number(summary?.retrying ?? 0),
      deadLettered,
      oldestQueuedSeconds
    },
    recent
  }
})
