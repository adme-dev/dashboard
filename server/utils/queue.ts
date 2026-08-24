import type { H3Event } from 'h3'
import type { GodModeAuditEventInput } from '~~/server/utils/godMode/audit'

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
  | 'catalog.sync'
  | 'merchant.catalog.reconcile'
  | 'merchant.catalog.readback'
  | 'lead.podium.post-commit'
  | 'hr.monday.migrate'
  | 'embed.social.client'
  | 'campaign.detail.refresh'
  | 'google.aimax.readiness'
  | 'creatives.sync'
  | 'spend.sync.platform'

export interface QueueJob {
  jobId?: string
  type: JobType
  payload: Record<string, unknown>
  /** ISO timestamp when the job was enqueued */
  enqueuedAt: string
}

export interface GodModeAuditTerminalQueueJob {
  type: 'god-mode.audit-terminal'
  payload: GodModeAuditEventInput
}

export type QueueConsumerJob = QueueJob | GodModeAuditTerminalQueueJob

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
  send(message: unknown, options?: { contentType?: string, delaySeconds?: number }): Promise<void>
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
 * Security fallback for a terminal God-mode event. This intentionally bypasses the normal DB-backed
 * job ledger: its only purpose is preserving immutable terminal evidence while the database path is
 * unavailable. Cloudflare Queue retry/DLQ behavior owns delivery visibility.
 */
export async function sendGodModeAuditTerminal(
  event: H3Event,
  payload: GodModeAuditEventInput
): Promise<boolean> {
  const queue = getQueue(event)
  if (!queue) return false
  await queue.send({ type: 'god-mode.audit-terminal', payload } satisfies GodModeAuditTerminalQueueJob, {
    contentType: 'json'
  })
  return true
}

/**
 * Enqueue a job. If the queue is unavailable (local dev), runs the fallback synchronously.
 * Returns true if enqueued, false if fallback was used.
 */
export async function enqueue(
  event: H3Event,
  type: JobType,
  payload: Record<string, unknown>,
  fallback?: () => Promise<void>,
  options?: { delaySeconds?: number }
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
      await queue.send(job, {
        contentType: 'json',
        ...(options?.delaySeconds ? { delaySeconds: options.delaySeconds } : {})
      })
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
