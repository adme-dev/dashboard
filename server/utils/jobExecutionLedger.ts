import type { QueueJob } from '~~/server/utils/queue'
import { execute, queryOne } from '~~/server/utils/db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REPLAYABLE_TYPES = new Set([
  'persona.audience.sync',
  'spend.sync.meta.account',
  'spend.sync.google.account',
  'catalog.sync'
])

export interface JobExecutionMetadata {
  queueAttempt: number
  maxAttempts: number
  retryDelaySeconds: number
  queueMessageId?: string | null
  dispatchMode?: 'queue' | 'inline'
}

export interface JobExecutionHandle extends JobExecutionMetadata {
  executionId: string | null
  jobId: string
}

function optionalUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null
}

function optionalTenant(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const tenant = value.trim()
  return tenant.length > 0 && tenant.length <= 255 ? tenant : null
}

function positiveInteger(value: unknown, fallback: number, max = 20): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

function errorClass(error: unknown): string {
  return (error instanceof Error ? error.name : 'unknown').slice(0, 160)
}

export function safeReplayContext(job: QueueJob): Record<string, string | number> {
  const payload = job.payload ?? {}
  switch (job.type) {
    case 'persona.audience.sync': {
      const exportId = optionalUuid(payload.exportId)
      const clientId = optionalUuid(payload.clientId)
      return exportId
        ? { exportId, ...(clientId ? { clientId } : {}) }
        : {}
    }
    case 'spend.sync.meta.account':
    case 'spend.sync.google.account': {
      const connectionId = optionalUuid(payload.connectionId)
      const syncJobId = optionalUuid(payload.jobId)
      const month = positiveInteger(payload.month, 0, 12)
      const year = positiveInteger(payload.year, 0, 9999)
      if (!connectionId || !month || !year) return {}
      return {
        connectionId,
        month,
        year,
        ...(syncJobId ? { jobId: syncJobId } : {})
      }
    }
    case 'catalog.sync': {
      const clientId = optionalUuid(payload.clientId)
      const sourceId = optionalUuid(payload.sourceId)
      return clientId && sourceId ? { clientId, sourceId } : {}
    }
    default:
      return {}
  }
}

export function isReplayableJobType(type: string) {
  return REPLAYABLE_TYPES.has(type)
}

function jobIdentity(job: QueueJob) {
  const payload = job.payload ?? {}
  return {
    jobId: optionalUuid(job.jobId) ?? globalThis.crypto.randomUUID(),
    clientId: optionalUuid(payload.clientId),
    tenantId: optionalTenant(payload.tenantId),
    replayContext: safeReplayContext(job),
    replayable: isReplayableJobType(job.type)
  }
}

export async function recordJobQueued(
  job: QueueJob,
  dispatchMode: 'queue' | 'inline'
): Promise<void> {
  const identity = jobIdentity(job)
  job.jobId = identity.jobId
  try {
    await execute(
      `INSERT INTO platform_jobs (
         id, job_type, client_id, tenant_id, status, dispatch_mode,
         replayable, replay_context, enqueued_at
       ) VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7::jsonb, $8::timestamptz)
       ON CONFLICT (id) DO UPDATE
         SET status = 'queued',
             dispatch_mode = EXCLUDED.dispatch_mode,
             enqueued_at = EXCLUDED.enqueued_at,
             next_attempt_at = NULL,
             completed_at = NULL,
             last_error_class = NULL,
             last_error_message_redacted = NULL,
             updated_at = NOW()`,
      [
        identity.jobId,
        job.type,
        identity.clientId,
        identity.tenantId,
        dispatchMode,
        identity.replayable,
        JSON.stringify(identity.replayContext),
        job.enqueuedAt
      ]
    )
  } catch (error) {
    console.warn({
      event: 'platform_job_queue_record_failed',
      jobType: job.type,
      errorClass: errorClass(error)
    })
  }
}

export async function markJobDispatchFailed(job: QueueJob): Promise<void> {
  const jobId = optionalUuid(job.jobId)
  if (!jobId) return
  try {
    await execute(
      `UPDATE platform_jobs
          SET status = 'failed',
              completed_at = NOW(),
              last_error_class = 'QueueDispatchError',
              last_error_message_redacted = 'queue_dispatch_failed',
              updated_at = NOW()
        WHERE id = $1`,
      [jobId]
    )
  } catch {
    // Dispatch failure is already logged by enqueue(); observability must not
    // turn a fallback-capable request into a user-facing failure.
  }
}

export async function startJobExecution(
  job: QueueJob,
  metadata: JobExecutionMetadata
): Promise<JobExecutionHandle> {
  const identity = jobIdentity(job)
  const queueAttempt = positiveInteger(metadata.queueAttempt, 1)
  const maxAttempts = positiveInteger(metadata.maxAttempts, 4)
  const retryDelaySeconds = Math.max(0, Number(metadata.retryDelaySeconds) || 0)
  const handle: JobExecutionHandle = {
    executionId: null,
    jobId: identity.jobId,
    queueAttempt,
    maxAttempts,
    retryDelaySeconds,
    queueMessageId: metadata.queueMessageId?.slice(0, 160) || null,
    dispatchMode: metadata.dispatchMode ?? 'queue'
  }

  try {
    const canonical = await queryOne<{ attempt_count: number }>(
      `INSERT INTO platform_jobs (
         id, job_type, client_id, tenant_id, status, dispatch_mode,
         queue_message_id, attempt_count, max_attempts, replayable,
         replay_context, enqueued_at, started_at
       ) VALUES (
         $1, $2, $3, $4, 'running', $5, $6, 1, $7, $8, $9::jsonb,
         $10::timestamptz, NOW()
       )
       ON CONFLICT (id) DO UPDATE
         SET status = 'running',
             queue_message_id = EXCLUDED.queue_message_id,
             attempt_count = platform_jobs.attempt_count + 1,
             max_attempts = EXCLUDED.max_attempts,
             started_at = COALESCE(platform_jobs.started_at, NOW()),
             next_attempt_at = NULL,
             updated_at = NOW()
       RETURNING attempt_count`,
      [
        identity.jobId,
        job.type,
        identity.clientId,
        identity.tenantId,
        metadata.dispatchMode ?? 'queue',
        handle.queueMessageId,
        maxAttempts,
        identity.replayable,
        JSON.stringify(identity.replayContext),
        job.enqueuedAt
      ]
    )
    const attempt = canonical?.attempt_count ?? queueAttempt
    const execution = await queryOne<{ id: string }>(
      `INSERT INTO platform_job_executions (
         job_id, job_type, client_id, tenant_id, attempt, enqueued_at
       ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
       ON CONFLICT (job_id, attempt) DO UPDATE
         SET status = 'running',
             started_at = NOW(),
             completed_at = NULL,
             duration_ms = NULL,
             error_class = NULL,
             error_message_redacted = NULL
       RETURNING id`,
      [
        identity.jobId,
        job.type,
        identity.clientId,
        identity.tenantId,
        attempt,
        job.enqueuedAt
      ]
    )
    handle.executionId = execution?.id ?? null
  } catch (error) {
    console.warn({
      event: 'job_execution_ledger_start_failed',
      jobType: job.type,
      errorClass: errorClass(error)
    })
  }
  return handle
}

export async function finishJobExecution(
  handle: JobExecutionHandle,
  status: 'succeeded' | 'failed',
  startedAt: number,
  error?: unknown,
  forceTerminal = false
): Promise<void> {
  const terminalFailure = status === 'failed'
    && (forceTerminal || handle.queueAttempt >= handle.maxAttempts)
  const canonicalStatus = status === 'succeeded'
    ? 'succeeded'
    : terminalFailure
      ? 'dead_lettered'
      : 'retrying'

  try {
    if (handle.executionId) {
      await execute(
        `UPDATE platform_job_executions
            SET status = $2,
                completed_at = NOW(),
                duration_ms = $3,
                error_class = $4,
                error_message_redacted = $5
          WHERE id = $1
            AND status = 'running'`,
        [
          handle.executionId,
          status,
          Math.max(0, Date.now() - startedAt),
          status === 'failed' ? errorClass(error) : null,
          status === 'failed' ? 'processor_failed' : null
        ]
      )
    }
    await execute(
      `UPDATE platform_jobs
          SET status = $2,
              completed_at = CASE WHEN $2 IN ('succeeded', 'dead_lettered') THEN NOW() ELSE NULL END,
              next_attempt_at = CASE
                WHEN $2 = 'retrying' THEN NOW() + ($3 * INTERVAL '1 second')
                ELSE NULL
              END,
              last_error_class = $4,
              last_error_message_redacted = $5,
              updated_at = NOW()
        WHERE id = $1`,
      [
        handle.jobId,
        canonicalStatus,
        handle.retryDelaySeconds,
        status === 'failed' ? errorClass(error) : null,
        status === 'failed' ? 'processor_failed' : null
      ]
    )
  } catch (ledgerError) {
    console.warn({
      event: 'job_execution_ledger_finish_failed',
      jobId: handle.jobId,
      errorClass: errorClass(ledgerError)
    })
  }
}
