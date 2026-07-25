import { queryOne, queryRows } from '~~/server/utils/db'

type SummaryRow = {
  total_30d: string
  queued: string
  running: string
  submitted: string
  succeeded_30d: string
  partial_30d: string
  failed_30d: string
  failed_24h: string
  stale_queued: string
  stale_running: string
  stale_submitted: string
  attempted_additions: string
  attempted_removals: string
  successful_additions: string
  successful_removals: string
  p95_completion_seconds: string | null
}

const numberValue = (value: unknown) => Number(value || 0)

export async function getPersonaExportOperationsSnapshot(clientId: string) {
  const [summary, providers, recent] = await Promise.all([
    queryOne<SummaryRow>(
      `SELECT
         COUNT(*) FILTER (WHERE queued_at >= NOW() - INTERVAL '30 days')::text AS total_30d,
         COUNT(*) FILTER (WHERE status = 'queued')::text AS queued,
         COUNT(*) FILTER (WHERE status = 'running')::text AS running,
         COUNT(*) FILTER (WHERE status = 'submitted')::text AS submitted,
         COUNT(*) FILTER (
           WHERE status = 'succeeded' AND queued_at >= NOW() - INTERVAL '30 days'
         )::text AS succeeded_30d,
         COUNT(*) FILTER (
           WHERE status = 'partial' AND queued_at >= NOW() - INTERVAL '30 days'
         )::text AS partial_30d,
         COUNT(*) FILTER (
           WHERE status = 'failed' AND queued_at >= NOW() - INTERVAL '30 days'
         )::text AS failed_30d,
         COUNT(*) FILTER (
           WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '24 hours'
         )::text AS failed_24h,
         COUNT(*) FILTER (
           WHERE status = 'queued' AND queued_at < NOW() - INTERVAL '5 minutes'
         )::text AS stale_queued,
         COUNT(*) FILTER (
           WHERE status = 'running'
             AND COALESCE(started_at, updated_at) < NOW() - INTERVAL '15 minutes'
         )::text AS stale_running,
         COUNT(*) FILTER (
           WHERE status = 'submitted'
             AND COALESCE(submitted_at, updated_at) < NOW() - INTERVAL '24 hours'
         )::text AS stale_submitted,
         COALESCE(SUM(attempted_additions) FILTER (
           WHERE queued_at >= NOW() - INTERVAL '30 days'
         ), 0)::text AS attempted_additions,
         COALESCE(SUM(attempted_removals) FILTER (
           WHERE queued_at >= NOW() - INTERVAL '30 days'
         ), 0)::text AS attempted_removals,
         COALESCE(SUM(successful_additions) FILTER (
           WHERE queued_at >= NOW() - INTERVAL '30 days'
         ), 0)::text AS successful_additions,
         COALESCE(SUM(successful_removals) FILTER (
           WHERE queued_at >= NOW() - INTERVAL '30 days'
         ), 0)::text AS successful_removals,
         (
           PERCENTILE_CONT(0.95) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (completed_at - queued_at))
           ) FILTER (
             WHERE completed_at IS NOT NULL
               AND queued_at >= NOW() - INTERVAL '30 days'
           )
         )::text AS p95_completion_seconds
       FROM crm_persona_audience_exports
       WHERE client_id = $1`,
      [clientId],
    ),
    queryRows<{
      provider: 'google_ads' | 'meta'
      total_30d: string
      succeeded_30d: string
      failed_30d: string
      last_completed_at: string | null
      last_error_at: string | null
    }>(
      `SELECT
         provider,
         COUNT(*) FILTER (WHERE queued_at >= NOW() - INTERVAL '30 days')::text AS total_30d,
         COUNT(*) FILTER (
           WHERE status IN ('succeeded', 'partial')
             AND queued_at >= NOW() - INTERVAL '30 days'
         )::text AS succeeded_30d,
         COUNT(*) FILTER (
           WHERE status = 'failed'
             AND queued_at >= NOW() - INTERVAL '30 days'
         )::text AS failed_30d,
         MAX(completed_at) FILTER (WHERE status IN ('succeeded', 'partial')) AS last_completed_at,
         MAX(updated_at) FILTER (WHERE status = 'failed') AS last_error_at
       FROM crm_persona_audience_exports
       WHERE client_id = $1
       GROUP BY provider
       ORDER BY provider`,
      [clientId],
    ),
    queryRows<{
      id: string
      request_id: string
      provider: 'google_ads' | 'meta'
      operation: 'sync' | 'remove'
      status: string
      attempt_count: number
      attempted_additions: number
      attempted_removals: number
      successful_additions: number
      successful_removals: number
      error_code: string | null
      error_message: string | null
      queued_at: string
      started_at: string | null
      submitted_at: string | null
      completed_at: string | null
      updated_at: string
    }>(
      `SELECT
         id,
         request_id,
         provider,
         operation,
         status,
         attempt_count,
         attempted_additions,
         attempted_removals,
         successful_additions,
         successful_removals,
         error_code,
         error_message,
         queued_at,
         started_at,
         submitted_at,
         completed_at,
         updated_at
       FROM crm_persona_audience_exports
       WHERE client_id = $1
       ORDER BY queued_at DESC
       LIMIT 30`,
      [clientId],
    ),
  ])

  const succeeded = numberValue(summary?.succeeded_30d)
  const partial = numberValue(summary?.partial_30d)
  const failed = numberValue(summary?.failed_30d)
  const terminal = succeeded + partial + failed
  const staleQueued = numberValue(summary?.stale_queued)
  const staleRunning = numberValue(summary?.stale_running)
  const staleSubmitted = numberValue(summary?.stale_submitted)
  const failed24h = numberValue(summary?.failed_24h)
  const status = staleRunning > 0 || staleSubmitted > 0 || failed24h >= 3
    ? 'critical'
    : staleQueued > 0 || failed24h > 0 || partial > 0
      ? 'degraded'
      : 'healthy'

  return {
    generatedAt: new Date().toISOString(),
    status,
    slos: {
      queueStartMinutes: 5,
      runningCompletionMinutes: 15,
      providerAcknowledgementHours: 24,
    },
    metrics: {
      total30d: numberValue(summary?.total_30d),
      queued: numberValue(summary?.queued),
      running: numberValue(summary?.running),
      submitted: numberValue(summary?.submitted),
      succeeded30d: succeeded,
      partial30d: partial,
      failed30d: failed,
      failed24h,
      staleQueued,
      staleRunning,
      staleSubmitted,
      attemptedAdditions: numberValue(summary?.attempted_additions),
      attemptedRemovals: numberValue(summary?.attempted_removals),
      successfulAdditions: numberValue(summary?.successful_additions),
      successfulRemovals: numberValue(summary?.successful_removals),
      terminalSuccessRate: terminal > 0
        ? Math.round(((succeeded + partial) / terminal) * 10_000) / 100
        : 100,
      p95CompletionSeconds: numberValue(summary?.p95_completion_seconds),
    },
    providers: providers.map(row => ({
      provider: row.provider,
      total30d: numberValue(row.total_30d),
      succeeded30d: numberValue(row.succeeded_30d),
      failed30d: numberValue(row.failed_30d),
      lastCompletedAt: row.last_completed_at,
      lastErrorAt: row.last_error_at,
    })),
    recent: recent.map(row => ({
      id: row.id,
      requestId: row.request_id,
      provider: row.provider,
      operation: row.operation,
      status: row.status,
      attemptCount: row.attempt_count,
      attemptedAdditions: row.attempted_additions,
      attemptedRemovals: row.attempted_removals,
      successfulAdditions: row.successful_additions,
      successfulRemovals: row.successful_removals,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      queuedAt: row.queued_at,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
    })),
  }
}
