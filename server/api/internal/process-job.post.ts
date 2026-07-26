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
import crypto from 'node:crypto'
import { defineEventHandler, getHeader, readBody, createError } from 'h3'
import { processJob } from '~~/server/utils/queueConsumer'
import type { QueueJob } from '~~/server/utils/queue'
import { startJobExecution, finishJobExecution } from '~~/server/utils/jobExecutionLedger'

function positiveHeader(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function isValidCronSecret(supplied: string | undefined): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected || !supplied) return false
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && !isValidCronSecret(cronSecret)) {
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
  const execution = await startJobExecution(job, {
    queueAttempt: positiveHeader(getHeader(event, 'x-queue-attempt'), 1),
    maxAttempts: positiveHeader(getHeader(event, 'x-queue-max-attempts'), 4),
    retryDelaySeconds: positiveHeader(getHeader(event, 'x-queue-retry-delay-seconds'), 15),
    queueMessageId: getHeader(event, 'x-queue-message-id'),
    dispatchMode: 'queue'
  })
  try {
    await processJob(job)
    await finishJobExecution(execution, 'succeeded', startedAt)
  } catch (error) {
    await finishJobExecution(execution, 'failed', startedAt, error)
    throw error
  }

  return { ok: true, type: job.type, jobId: job.jobId }
})
