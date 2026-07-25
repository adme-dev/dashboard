/**
 * Internal: process a single Cloudflare Queue job.
 * POST /api/internal/process-job
 *
 * The `agency-jobs` queue (JOBS_QUEUE) has NO consumer on Cloudflare Pages —
 * Pages projects can't declare queues.consumers, and the Nitro `cloudflare:queue`
 * hook (server/plugins/queue.ts) never fires there. So messages produced to that
 * queue (spend.sync.meta.account, board.notify, eom.generate, embed.*) piled up
 * unconsumed and never ran — which left the daily ad-spend sync stuck "running"
 * with 0 accounts processed (see spend_sync_jobs).
 *
 * The standalone workers/jobs-consumer Worker consumes `agency-jobs` and POSTs
 * each message here. Running processJob() inside a real Pages request gives it a
 * request context (fast pooled DB driver) plus reachable KV / platform bindings —
 * the same bridge pattern workers/pages-cron uses for /api/cron/* HTTP routes.
 *
 * Auth: x-cron-secret must match CRON_SECRET (same secret pages-cron uses).
 *
 * Body: a QueueJob — { type, payload, enqueuedAt }
 *
 * Returns 200 on success. Throws (non-2xx) on failure so the Worker re-queues the
 * message for retry, then dead-letters per the consumer config.
 */
import { defineEventHandler, getHeader, readBody, createError } from 'h3'
import { processJob } from '~~/server/utils/queueConsumer'
import type { QueueJob } from '~~/server/utils/queue'
import { startJobExecution, finishJobExecution } from '~~/server/utils/jobExecutionLedger'

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const rawJob = await readBody<Partial<QueueJob>>(event).catch(() => null)
  const job = rawJob
    ? {
        ...rawJob,
        jobId: typeof rawJob.jobId === 'string' && /^[0-9a-f-]{36}$/i.test(rawJob.jobId)
          ? rawJob.jobId
          : globalThis.crypto.randomUUID()
      } as QueueJob
    : null
  if (!job || typeof job.type !== 'string' || typeof job.payload !== 'object' || job.payload === null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid job body' })
  }

  const startedAt = Date.now()
  const executionId = await startJobExecution(job)
  try {
    await processJob(job)
    await finishJobExecution(executionId, 'succeeded', startedAt)
  } catch (error) {
    await finishJobExecution(executionId, 'failed', startedAt, error)
    throw error
  }

  return { ok: true, type: job.type, jobId: job.jobId }
})
