// workers/social-dispatch-cron/src/index.ts
// Cloudflare Cron Worker — fires the Pages app's social publishing dispatcher on a
// schedule. The Nitro Cloudflare-Pages build has no scheduled() handler, so this
// lightweight companion worker fills the gap (same pattern as workers/meta-status-cron).
// It POSTs /api/cron/publish-social-posts, which claims due posts (idempotently) and
// publishes them across their connected networks.

interface Env {
  APP_BASE_URL: string
  CRON_SECRET: string
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const jobs = ['publish-social-posts', 'replenish-social-news']
    const results = await Promise.allSettled(jobs.map(async (job) => {
      const resp = await fetch(`${env.APP_BASE_URL}/api/cron/${job}`, {
        method: 'POST',
        headers: { 'x-cron-secret': env.CRON_SECRET },
        signal: AbortSignal.timeout(55_000)
      })
      console.log('social-dispatch-cron.run', { job, status: resp.status })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    }))
    const failed = jobs.filter((_, index) => results[index]?.status === 'rejected')
    if (failed.length) {
      // Finish both jobs before marking the invocation failed so one outage does
      // not suppress the other job, and broken authentication remains visible.
      console.error('social-dispatch-cron.request-failed', { jobs: failed })
      throw new Error(`Social cron job failed: ${failed.join(', ')}`)
    }
  }
}
