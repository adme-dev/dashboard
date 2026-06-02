// workers/social-listening-cron/src/index.ts
// Cloudflare Cron Worker — fires the Pages app's listening collector (Slice 4b). Pages has no
// scheduled() handler, so this companion Worker POSTs /api/cron/sync-social-listening. The endpoint
// is a no-op until at least one external source's key/flag is set (per-source gated).
interface Env { APP_BASE_URL: string; CRON_SECRET: string }

export default {
  async scheduled(_c: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const url = `${env.APP_BASE_URL}/api/cron/sync-social-listening`
    const resp = await fetch(url, { method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET } })
    console.log('social-listening-cron.run', { status: resp.status, body: (await resp.text()).slice(0, 200) })
  },
}
