import type { H3Event } from 'h3'

/**
 * Job types that can be dispatched to the queue.
 */
export type JobType =
  | 'board.notify'
  | 'board.automate'
  | 'lifecycle.evaluate'
  | 'eom.generate'
  | 'spend.sync.meta'
  | 'spend.sync.meta.account'
  | 'spend.sync.google'
  | 'spend.sync.google.account'
  | 'spend.sync.tiktok'
  | 'persona.audience.sync'
  | 'embed.task'
  | 'embed.brief'
  | 'embed.client'
  | 'embed.rate_card'
  | 'training.extract'
  | 'dissect.analyze'
  | 'embed.financial.expenses'
  | 'embed.financial.invoices'
  | 'embed.financial.clients'
  | 'embed.financial.pnl'
  | 'embed.financial.cash'
  | 'site-intelligence.enrich'

export interface QueueJob {
  jobId?: string
  type: JobType
  payload: Record<string, unknown>
  /** ISO timestamp when the job was enqueued */
  enqueuedAt: string
}

async function recordQueued(job: QueueJob, dispatchMode: 'queue' | 'inline') {
  const { recordJobQueued } = await import('~~/server/utils/jobExecutionLedger')
  await recordJobQueued(job, dispatchMode)
}

async function recordDispatchFailure(job: QueueJob) {
  const { markJobDispatchFailed } = await import('~~/server/utils/jobExecutionLedger')
  await markJobDispatchFailed(job)
}

async function runInline(job: QueueJob, fallback: () => Promise<void>) {
  const { startJobExecution, finishJobExecution } = await import('~~/server/utils/jobExecutionLedger')
  const startedAt = Date.now()
  const execution = await startJobExecution(job, {
    queueAttempt: 1,
    maxAttempts: 1,
    retryDelaySeconds: 0,
    dispatchMode: 'inline'
  })
  try {
    await fallback()
    await finishJobExecution(execution, 'succeeded', startedAt)
  } catch (error) {
    await finishJobExecution(execution, 'failed', startedAt, error, true)
    console.error(`[Queue] Fallback for ${job.type} failed:`, error)
  }
}

/** Minimal Queue interface matching Cloudflare Queue producer */
interface QueueProducer {
  send(message: unknown, options?: { contentType?: string }): Promise<void>
}

/**
 * Get the Cloudflare Queue producer from the event context.
 * Returns null when Queue is unavailable (local dev without wrangler).
 */
export function getQueue(event: H3Event): QueueProducer | null {
  try {
    const env = (event.context as { cloudflare?: { env?: { JOBS_QUEUE?: QueueProducer } } }).cloudflare?.env
    return env?.JOBS_QUEUE ?? null
  } catch {
    return null
  }
}

/**
 * Enqueue a job. If the queue is unavailable (local dev), runs the fallback synchronously.
 * Returns true if enqueued, false if fallback was used.
 */
export async function enqueue(
  event: H3Event,
  type: JobType,
  payload: Record<string, unknown>,
  fallback?: () => Promise<void>
): Promise<boolean> {
  const queue = getQueue(event)
  const job: QueueJob = {
    jobId: globalThis.crypto.randomUUID(),
    type,
    payload,
    enqueuedAt: new Date().toISOString(),
  }

  if (queue) {
    try {
      await recordQueued(job, 'queue')
      await queue.send(job, { contentType: 'json' })
      return true
    } catch (err) {
      console.error(`[Queue] Failed to enqueue ${type}:`, err)
      await recordDispatchFailure(job)
      // Fall through to fallback
    }
  }

  // Fallback: run inline (local dev or queue failure)
  if (fallback) {
    await recordQueued(job, 'inline')
    void runInline(job, fallback)
  } else {
    await recordDispatchFailure(job)
  }
  return false
}
