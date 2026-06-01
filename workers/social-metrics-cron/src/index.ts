// workers/social-metrics-cron/src/index.ts
// Cloudflare Cron Worker — fires the Pages app's organic-metrics collector on a schedule
// (Slice 3 / 3a). The Nitro Cloudflare-Pages build has no scheduled() handler, so this
// companion worker fills the gap (same pattern as workers/social-inbox-cron). It POSTs
// /api/cron/sync-social-metrics, which snapshots account + per-post insights (idempotent upserts).

interface Env {
  APP_BASE_URL: string
  CRON_SECRET: string
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const url = `${env.APP_BASE_URL}/api/cron/sync-social-metrics`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'x-cron-secret': env.CRON_SECRET },
    })
    const text = await resp.text()
    console.log('social-metrics-cron.run', {
      status: resp.status,
      body: text.slice(0, 200),
    })
  },
}
