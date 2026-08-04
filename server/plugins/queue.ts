/**
 * Nitro plugin: Cloudflare Queue Consumer
 *
 * Registers a queue handler on the Cloudflare Pages worker.
 * Messages are routed to processJob() based on their type field.
 *
 * On Cloudflare Pages, the queue consumer is attached via nitroApp hooks.
 * Locally (without wrangler), this plugin is a no-op.
 */

import { processJob } from '~~/server/utils/queueConsumer'
import type { QueueJob } from '~~/server/utils/queue'

export default defineNitroPlugin((nitroApp) => {
  // Hook into Cloudflare's module worker queue handler
  // This is called when messages arrive from the JOBS_QUEUE binding
  nitroApp.hooks.hook('cloudflare:queue' as any, async (batch: any) => {
    const messages: Array<{ body: QueueJob; ack: () => void; retry: () => void }> = batch?.messages || []

    for (const msg of messages) {
      try {
        // Native Pages queue hooks do not provide an H3 request event. Jobs that
        // need bindings are normally bridged through /api/internal/process-job.
        await processJob(msg.body, {})
        msg.ack()
      } catch (err) {
        console.error(`[Queue] Job ${msg.body?.type} failed, will retry:`, err)
        msg.retry()
      }
    }
  })
})
