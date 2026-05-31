// workers/meta-status-cron/src/index.ts
// Cloudflare Cron Worker — fires the Pages app's Meta ad status-sync endpoint
// on a schedule. The Nitro Cloudflare-Pages build has no scheduled() handler,
// so this lightweight companion worker fills the gap (same pattern as
// workers/leads-cron). It POSTs /api/cron/meta-ad-status-sync, which polls Meta
// for each non-terminal published ad's effective_status and updates
// banner_ad_publishes.status.

interface Env {
  APP_BASE_URL: string
  CRON_SECRET: string
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const url = `${env.APP_BASE_URL}/api/cron/meta-ad-status-sync`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'x-cron-secret': env.CRON_SECRET },
    })
    const text = await resp.text()
    console.log('meta-status-cron.run', {
      status: resp.status,
      body: text.slice(0, 200),
    })
  },
}
