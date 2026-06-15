// workers/jobs-consumer/src/index.ts
// Consumer for the Pages app's `agency-jobs` queue (JOBS_QUEUE producer binding).
//
// Cloudflare Pages can't declare queue consumers and the Nitro `cloudflare:queue`
// hook never fires on the deployed Pages worker, so messages produced to
// `agency-jobs` had no consumer at all. This Worker fills that gap by POSTing each
// message to the Pages app's /api/internal/process-job route, which runs
// processJob() in a real request context. Same HTTP-bridge pattern as
// workers/pages-cron.
//
// ack()  → message handled (Pages returned 2xx)
// retry() → Pages failed/threw; the queue redelivers (up to max_retries, then
//           dead-letters to agency-jobs-dlq per wrangler.toml).

interface Env {
  APP_BASE_URL: string
  CRON_SECRET: string
}

interface QueueJob {
  type?: string
  payload?: unknown
  enqueuedAt?: string
}

export default {
  async queue(batch: MessageBatch<QueueJob>, env: Env, _ctx: ExecutionContext): Promise<void> {
    const url = `${env.APP_BASE_URL}/api/internal/process-job`

    await Promise.all(
      batch.messages.map(async (msg) => {
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-cron-secret': env.CRON_SECRET,
            },
            body: JSON.stringify(msg.body),
          })

          if (resp.ok) {
            msg.ack()
            return
          }

          // Non-2xx: log a short body slice and let the queue retry.
          const text = await resp.text().catch(() => '')
          console.error('jobs-consumer.non-ok', {
            type: msg.body?.type,
            status: resp.status,
            body: text.slice(0, 200),
          })
          msg.retry()
        } catch (err) {
          console.error('jobs-consumer.error', { type: msg.body?.type, error: String(err) })
          msg.retry()
        }
      }),
    )
  },
}
