// workers/leads-cron/src/index.ts
// Cloudflare Cron Worker — fans out scheduled triggers to the Pages app's
// /api/leads/_internal/* endpoints. Pages itself doesn't support scheduled
// handlers, so this lightweight worker fills that gap.

interface Env {
  APP_BASE_URL: string
  INTERNAL_CRON_TOKEN: string
}

const ROUTES: Record<string, string> = {
  '*/5 * * * *': '/api/leads/_internal/recover-stuck-claims',
  '10 3 * * *': '/api/leads/_internal/purge-ingestion-errors',
  '30 3 * * *': '/api/leads/_internal/purge-retention',
}

export default {
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const path = ROUTES[controller.cron]
    if (!path) {
      console.warn('unknown cron', controller.cron)
      return
    }
    const url = `${env.APP_BASE_URL}${path}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.INTERNAL_CRON_TOKEN}` },
    })
    const text = await resp.text()
    console.log('cron.run', {
      cron: controller.cron,
      path,
      status: resp.status,
      body: text.slice(0, 200),
    })
  },
}
