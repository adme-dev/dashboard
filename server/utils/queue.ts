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
  | 'knowledge.extract'
  | 'knowledge.index'

export interface QueueJob {
  jobId?: string
  type: JobType
  payload: Record<string, unknown>
  /** ISO timestamp when the job was enqueued */
  enqueuedAt: string
}

export function boardKnowledgeQueuePayload(payload: Record<string, unknown>): {
  submissionId: string
  expectedVersionKey: string
} {
  const keys = Object.keys(payload)
  if (keys.length !== 2
    || !keys.includes('submissionId')
    || !keys.includes('expectedVersionKey')
    || typeof payload.submissionId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.submissionId)
    || typeof payload.expectedVersionKey !== 'string'
    || payload.expectedVersionKey.length < 1
    || payload.expectedVersionKey.length > 500) {
    throw new Error('invalid_board_knowledge_queue_payload')
  }
  return {
    submissionId: payload.submissionId,
    expectedVersionKey: payload.expectedVersionKey
  }
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
  if (type === 'knowledge.extract' || type === 'knowledge.index') {
    boardKnowledgeQueuePayload(payload)
  }
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

  // Binding-aware knowledge jobs can run inline during local development while
  // preserving the originating H3 event. Queue messages themselves remain IDs only.
  const inlineFallback = fallback ?? (
    type === 'knowledge.extract' || type === 'knowledge.index'
      ? async () => {
          const { processJob } = await import('~~/server/utils/queueConsumer')
          await processJob(job, { event })
        }
      : undefined
  )

  // Fallback: run inline (local dev or queue failure)
  if (inlineFallback) {
    await recordQueued(job, 'inline')
    void runInline(job, inlineFallback)
  } else {
    await recordDispatchFailure(job)
  }
  return false
}
