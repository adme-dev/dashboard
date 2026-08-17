// workers/leads-delivery-worker/src/index.ts
//
// CF Queue consumer for the leads engine. Imports the same dispatch loop the
// Pages app uses for inline fallback. Database access goes through HYPERDRIVE.
//
// IMPORTANT: this Worker shares server/utils/leads/* with the Pages app. The
// build step copies the relevant files via scripts/sync-shared.sh.
//
// queues.consumers binding configured in CF dashboard (NOT in wrangler.toml):
//   queue: leads-delivery-queue
//   max_batch_size: 10
//   max_batch_timeout: 5
//   max_retries: 0   (we manage retries in-app)
//   dead_letter_queue: leads-delivery-dlq

interface Env {
  HYPERDRIVE: { connectionString: string }
  DATABASE_URL: string
  RESEND_API_KEY: string
  WORKER_ID_PREFIX: string
  AUTOGATE_LEAD_API_USERNAME?: string
  AUTOGATE_LEAD_API_PASSWORD?: string
  AUTOGATE_LEAD_API_VERSION?: string
}

type QueueMessageBody = {
  type: 'rules.evaluate' | 'delivery.dispatch' | 'crm.promote'
  payload: { lead_id?: string; delivery_id?: string },
  attempt?: number
}

export default {
  async queue(
    batch: MessageBatch<QueueMessageBody>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    if (env.HYPERDRIVE?.connectionString) {
      ;(globalThis as any).__HYPERDRIVE_CS = env.HYPERDRIVE.connectionString
    }
    process.env.DATABASE_URL = env.DATABASE_URL
    process.env.RESEND_API_KEY = env.RESEND_API_KEY
    process.env.AUTOGATE_LEAD_API_USERNAME = env.AUTOGATE_LEAD_API_USERNAME ?? ''
    process.env.AUTOGATE_LEAD_API_PASSWORD = env.AUTOGATE_LEAD_API_PASSWORD ?? ''
    process.env.AUTOGATE_LEAD_API_VERSION = env.AUTOGATE_LEAD_API_VERSION ?? 'v2'

    const { handleQueueMessage } = await import('./dispatch')

    for (const msg of batch.messages) {
      try {
        await handleQueueMessage(msg.body)
        msg.ack()
      } catch (e) {
        console.error('queue.handler.error', e)
        msg.retry({ delaySeconds: 30 })
      }
    }
  },
}
