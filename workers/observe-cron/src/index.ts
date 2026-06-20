// workers/observe-cron/src/index.ts
// Cloudflare Cron Worker — fires the Pages app's observed-memory distiller (Observe & Learn W-2). Pages
// has no scheduled() handler, so this companion Worker POSTs /api/cron/observe-and-learn once a day. The
// endpoint is a no-op until AI_OBSERVE_ENABLED is set on the Pages project (dormancy gate), and is
// idempotent (per-user watermark), so overlapping or repeated ticks are harmless.
interface Env { APP_BASE_URL: string; CRON_SECRET: string }

export default {
  async scheduled(_c: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const url = `${env.APP_BASE_URL}/api/cron/observe-and-learn`
    const resp = await fetch(url, { method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET } })
    console.log('observe-cron.run', { status: resp.status, body: (await resp.text()).slice(0, 200) })
  },
}
