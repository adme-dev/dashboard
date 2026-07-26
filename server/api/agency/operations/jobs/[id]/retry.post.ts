import type { JobType, QueueJob } from '~~/server/utils/queue'
import { getQueue } from '~~/server/utils/queue'
import { requirePermission } from '~~/server/utils/auth'
import { execute, queryOne } from '~~/server/utils/db'
import { isReplayableJobType } from '~~/server/utils/jobExecutionLedger'

export default defineEventHandler(async event => {
  const actor = await requirePermission(event, 'ADMIN')
  const jobId = getRouterParam(event, 'id')
  if (!jobId) throw createError({ statusCode: 400, statusMessage: 'Job ID is required' })

  const job = await queryOne<{
    id: string
    job_type: JobType
    status: string
    replayable: boolean
    replay_context: Record<string, unknown>
  }>(
    `SELECT id, job_type, status, replayable, replay_context
       FROM platform_jobs
      WHERE id = $1`,
    [jobId]
  )
  if (!job) throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  if (!['failed', 'dead_lettered'].includes(job.status)) {
    throw createError({ statusCode: 409, statusMessage: 'Only failed or dead-lettered jobs can be retried' })
  }
  if (!job.replayable || !isReplayableJobType(job.job_type)) {
    throw createError({ statusCode: 409, statusMessage: 'This job type cannot be safely replayed' })
  }

  const queue = getQueue(event)
  if (!queue) throw createError({ statusCode: 503, statusMessage: 'Job queue is unavailable' })

  const queuedAt = new Date().toISOString()
  const message: QueueJob = {
    jobId: job.id,
    type: job.job_type,
    payload: job.replay_context,
    enqueuedAt: queuedAt
  }

  await execute(
    `UPDATE platform_jobs
        SET status = 'queued',
            manual_retry_count = manual_retry_count + 1,
            enqueued_at = $2::timestamptz,
            started_at = NULL,
            next_attempt_at = NULL,
            completed_at = NULL,
            last_error_class = NULL,
            last_error_message_redacted = NULL,
            updated_at = NOW()
      WHERE id = $1`,
    [job.id, queuedAt]
  )

  try {
    await queue.send(message, { contentType: 'json' })
  } catch (error) {
    await execute(
      `UPDATE platform_jobs
          SET status = 'failed',
              completed_at = NOW(),
              last_error_class = 'QueueDispatchError',
              last_error_message_redacted = 'manual_retry_dispatch_failed',
              updated_at = NOW()
        WHERE id = $1`,
      [job.id]
    )
    throw error
  }

  console.info({
    event: 'platform_job_manual_retry',
    jobId: job.id,
    jobType: job.job_type,
    actorId: actor.id
  })
  return { success: true, jobId: job.id, status: 'queued' }
})
