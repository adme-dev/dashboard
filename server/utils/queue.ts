import type { H3Event } from 'h3'

/**
 * Job types that can be dispatched to the queue.
 */
export type JobType =
  | 'board.notify'
  | 'board.automate'
  | 'eom.generate'
  | 'spend.sync.meta'
  | 'spend.sync.google'
  | 'spend.sync.tiktok'
  | 'embed.task'
  | 'embed.brief'
  | 'embed.client'
  | 'training.extract'
  | 'dissect.analyze'
  | 'embed.financial.expenses'
  | 'embed.financial.invoices'
  | 'embed.financial.clients'
  | 'embed.financial.pnl'
  | 'embed.financial.cash'

export interface QueueJob {
  type: JobType
  payload: Record<string, any>
  /** ISO timestamp when the job was enqueued */
  enqueuedAt: string
}

/** Minimal Queue interface matching Cloudflare Queue producer */
interface QueueProducer {
  send(message: any, options?: { contentType?: string }): Promise<void>
}

/**
 * Get the Cloudflare Queue producer from the event context.
 * Returns null when Queue is unavailable (local dev without wrangler).
 */
export function getQueue(event: H3Event): QueueProducer | null {
  try {
    const env = (event.context as any).cloudflare?.env
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
  payload: Record<string, any>,
  fallback?: () => Promise<void>
): Promise<boolean> {
  const queue = getQueue(event)

  if (queue) {
    try {
      const job: QueueJob = {
        type,
        payload,
        enqueuedAt: new Date().toISOString(),
      }
      await queue.send(job, { contentType: 'json' })
      return true
    } catch (err) {
      console.error(`[Queue] Failed to enqueue ${type}:`, err)
      // Fall through to fallback
    }
  }

  // Fallback: run inline (local dev or queue failure)
  if (fallback) {
    fallback().catch(err =>
      console.error(`[Queue] Fallback for ${type} failed:`, err)
    )
  }
  return false
}
