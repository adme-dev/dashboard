import type { QueueJob } from '~~/server/utils/queue'
import { queryOne, execute } from '~~/server/utils/db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function optionalUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value : null
}

function optionalTenant(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const tenant = value.trim()
  return tenant.length > 0 && tenant.length <= 255 ? tenant : null
}

function errorClass(error: unknown): string {
  return (error instanceof Error ? error.name : 'unknown').slice(0, 160)
}

export async function startJobExecution(job: QueueJob): Promise<string | null> {
  try {
    const payload = job.payload ?? {}
    const jobId = optionalUuid(job.jobId) ?? globalThis.crypto.randomUUID()
    const row = await queryOne<{ id: string }>(
      `INSERT INTO platform_job_executions (
         job_id, job_type, client_id, tenant_id, attempt, enqueued_at
       )
       SELECT $1, $2, $3, $4, COALESCE(MAX(attempt), 0) + 1, $5::timestamptz
         FROM platform_job_executions
        WHERE job_id = $1
       RETURNING id`,
      [
        jobId,
        job.type,
        optionalUuid(payload.clientId),
        optionalTenant(payload.tenantId),
        job.enqueuedAt
      ]
    )
    return row?.id ?? null
  } catch (error) {
    console.warn({
      event: 'job_execution_ledger_start_failed',
      jobType: job.type,
      errorClass: errorClass(error)
    })
    return null
  }
}

export async function finishJobExecution(
  executionId: string | null,
  status: 'succeeded' | 'failed',
  startedAt: number,
  error?: unknown
): Promise<void> {
  if (!executionId) return
  try {
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
        executionId,
        status,
        Math.max(0, Date.now() - startedAt),
        status === 'failed' ? errorClass(error) : null,
        status === 'failed' ? 'processor_failed' : null
      ]
    )
  } catch (ledgerError) {
    console.warn({
      event: 'job_execution_ledger_finish_failed',
      executionId,
      errorClass: errorClass(ledgerError)
    })
  }
}
