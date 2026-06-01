// workers/social-report-cron/src/index.ts
// Cloudflare Cron Worker — fires the Pages app's scheduled-report sender (Slice 3 / 3c). The Nitro
// Cloudflare-Pages build has no scheduled() handler, so this companion worker fills the gap (same
// pattern as social-inbox-cron / social-metrics-cron). It POSTs /api/cron/send-social-reports, which
// is HARD-gated by SOCIAL_REPORTS_ENABLED — a no-op until the operator turns it on.

interface Env {
  APP_BASE_URL: string
  CRON_SECRET: string
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const url = `${env.APP_BASE_URL}/api/cron/send-social-reports`
    const resp = await fetch(url, { method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET } })
    const text = await resp.text()
    console.log('social-report-cron.run', { status: resp.status, body: text.slice(0, 200) })
  },
}
