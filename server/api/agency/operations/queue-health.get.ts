import { requirePermission } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'

export default defineEventHandler(async event => {
  await requirePermission(event, 'ADMIN')
  setHeader(event, 'Cache-Control', 'private, no-store')

  const summary = await queryOne<{
    total_24h: string
    succeeded_24h: string
    failed_24h: string
    running: string
    stale_running: string
    p95_duration_ms: string | null
    max_queue_lag_seconds: string | null
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours') AS total_24h,
       COUNT(*) FILTER (
         WHERE started_at >= NOW() - INTERVAL '24 hours' AND status = 'succeeded'
       ) AS succeeded_24h,
       COUNT(*) FILTER (
         WHERE started_at >= NOW() - INTERVAL '24 hours' AND status = 'failed'
       ) AS failed_24h,
       COUNT(*) FILTER (WHERE status = 'running') AS running,
       COUNT(*) FILTER (
         WHERE status = 'running' AND started_at < NOW() - INTERVAL '10 minutes'
       ) AS stale_running,
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

  const failures = await queryRows<{
    jobType: string
    failures: string
    lastFailureAt: string
  }>(
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

  const total = Number(summary?.total_24h ?? 0)
  const succeeded = Number(summary?.succeeded_24h ?? 0)
  const successRate = total > 0 ? succeeded / total : 1
  const staleRunning = Number(summary?.stale_running ?? 0)
  const maxQueueLagSeconds = Number(summary?.max_queue_lag_seconds ?? 0)

  return {
    generatedAt: new Date().toISOString(),
    slo: {
      successRateTarget: 0.99,
      maxQueueLagSecondsTarget: 300,
      staleExecutionMinutes: 10
    },
    healthy: successRate >= 0.99 && staleRunning === 0 && maxQueueLagSeconds <= 300,
    metrics: {
      total24h: total,
      succeeded24h: succeeded,
      failed24h: Number(summary?.failed_24h ?? 0),
      successRate,
      running: Number(summary?.running ?? 0),
      staleRunning,
      p95DurationMs: Number(summary?.p95_duration_ms ?? 0),
      maxQueueLagSeconds
    },
    failures: failures.map(item => ({
      jobType: item.jobType,
      failures: Number(item.failures),
      lastFailureAt: item.lastFailureAt
    })),
    deadLetterQueue: {
      configured: true,
      name: 'agency-jobs-dlq'
    }
  }
})
