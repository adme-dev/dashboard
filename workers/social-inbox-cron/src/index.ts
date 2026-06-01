// workers/social-inbox-cron/src/index.ts
// Cloudflare Cron Worker — fires the Pages app's engagement-inbox poll dispatcher on a
// schedule. The Nitro Cloudflare-Pages build has no scheduled() handler, so this lightweight
// companion worker fills the gap (same pattern as workers/social-dispatch-cron). It POSTs
// /api/cron/sync-social-inbox, which pulls new comments/reviews per connected account.

interface Env {
  APP_BASE_URL: string
  CRON_SECRET: string
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const url = `${env.APP_BASE_URL}/api/cron/sync-social-inbox`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'x-cron-secret': env.CRON_SECRET },
    })
    const text = await resp.text()
    console.log('social-inbox-cron.run', {
      status: resp.status,
      body: text.slice(0, 200),
    })
  },
}
