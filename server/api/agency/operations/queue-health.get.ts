import { requirePermission } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async event => {
  await requirePermission(event, 'ADMIN')
  setHeader(event, 'Cache-Control', 'private, no-store')

  const summary = await queryOne<{
    total_24h: string
    succeeded_24h: string
    failed_24h: string
    queued: string
    running: string
    retrying: string
    dead_lettered: string
    stale_running: string
    oldest_queued_seconds: string | null
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE enqueued_at >= NOW() - INTERVAL '24 hours') AS total_24h,
       COUNT(*) FILTER (
         WHERE completed_at >= NOW() - INTERVAL '24 hours' AND status = 'succeeded'
       ) AS succeeded_24h,
       COUNT(*) FILTER (
         WHERE updated_at >= NOW() - INTERVAL '24 hours'
           AND status IN ('failed', 'dead_lettered')
       ) AS failed_24h,
       COUNT(*) FILTER (WHERE status = 'queued') AS queued,
       COUNT(*) FILTER (WHERE status = 'running') AS running,
       COUNT(*) FILTER (WHERE status = 'retrying') AS retrying,
       COUNT(*) FILTER (WHERE status = 'dead_lettered') AS dead_lettered,
       COUNT(*) FILTER (
         WHERE status = 'running' AND started_at < NOW() - INTERVAL '10 minutes'
       ) AS stale_running,
       MAX(EXTRACT(EPOCH FROM (NOW() - enqueued_at)))
         FILTER (WHERE status = 'queued') AS oldest_queued_seconds
     FROM platform_jobs`
  )

  const performance = await queryOne<{
    p95_duration_ms: string | null
    max_queue_lag_seconds: string | null
  }>(
    `SELECT
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)
         FILTER (
           WHERE started_at >= NOW() - INTERVAL '24 hours'
             AND status = 'succeeded'
             AND duration_ms IS NOT NULL
         ) AS p95_duration_ms,
       MAX(EXTRACT(EPOCH FROM (started_at - enqueued_at)))
         FILTER (
           WHERE started_at >= NOW() - INTERVAL '24 hours'
             AND enqueued_at IS NOT NULL
         ) AS max_queue_lag_seconds
     FROM platform_job_executions`
  )

  const failures = await queryRows(
    `SELECT job_type AS "jobType",
            COUNT(*) AS failures,
            MAX(completed_at) AS "lastFailureAt"
       FROM platform_job_executions
      WHERE status = 'failed'
        AND started_at >= NOW() - INTERVAL '24 hours'
      GROUP BY job_type
      ORDER BY COUNT(*) DESC, job_type
      LIMIT 20`
  )

  const recent = await queryRows(
    `SELECT id, job_type AS "jobType", client_id AS "clientId", status,
            attempt_count AS "attemptCount", max_attempts AS "maxAttempts",
            replayable, enqueued_at AS "enqueuedAt", updated_at AS "updatedAt"
       FROM platform_jobs
      ORDER BY updated_at DESC
      LIMIT 50`
  )

  const total = Number(summary?.total_24h ?? 0)
  const succeeded = Number(summary?.succeeded_24h ?? 0)
  const failed = Number(summary?.failed_24h ?? 0)
  const terminal = succeeded + failed
  const successRate = terminal > 0 ? succeeded / terminal : 1
  const staleRunning = Number(summary?.stale_running ?? 0)
  const maxQueueLagSeconds = Math.max(
    Number(performance?.max_queue_lag_seconds ?? 0),
    Number(summary?.oldest_queued_seconds ?? 0)
  )
  const deadLettered = Number(summary?.dead_lettered ?? 0)

  return {
    generatedAt: new Date().toISOString(),
    slo: {
      successRateTarget: 0.99,
      maxQueueLagSecondsTarget: 300,
      staleExecutionMinutes: 10
    },
    healthy: successRate >= 0.99
      && staleRunning === 0
      && maxQueueLagSeconds <= 300
      && deadLettered === 0,
    metrics: {
      total24h: total,
      succeeded24h: succeeded,
      failed24h: failed,
      successRate,
      queued: Number(summary?.queued ?? 0),
      running: Number(summary?.running ?? 0),
      retrying: Number(summary?.retrying ?? 0),
      deadLettered,
      staleRunning,
      p95DurationMs: Number(performance?.p95_duration_ms ?? 0),
      maxQueueLagSeconds
    },
    failures: failures.map((item: any) => ({
      jobType: item.jobType,
      failures: Number(item.failures),
      lastFailureAt: item.lastFailureAt
    })),
    recent,
    deadLetterQueue: {
      configured: true,
      name: 'agency-jobs-dlq'
    }
  }
})
