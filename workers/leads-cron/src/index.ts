// workers/leads-cron/src/index.ts
// Cloudflare Cron Worker — fans out scheduled triggers to the Pages app's
// /api/leads/_internal/* endpoints. Pages itself doesn't support scheduled
// handlers, so this lightweight worker fills that gap.

interface Env {
  APP_BASE_URL: string
  INTERNAL_CRON_TOKEN: string
}

const ROUTES: Record<string, string[]> = {
  '*/5 * * * *': [
    '/api/leads/_internal/recover-stuck-claims',
    '/api/leads/_internal/recover-email-ingestions'
  ],
  '10 3 * * *': ['/api/leads/_internal/purge-ingestion-errors'],
  '30 3 * * *': ['/api/leads/_internal/purge-retention']
}

export default {
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const paths = ROUTES[controller.cron]
    if (!paths) {
      console.warn('unknown cron', controller.cron)
      return
    }
    await Promise.all(paths.map(async (path) => {
      try {
        const resp = await fetch(`${env.APP_BASE_URL}${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.INTERNAL_CRON_TOKEN}` }
        })
        if (!resp.ok) {
          console.error('cron.run.failed', {
            cron: controller.cron,
            path,
            status: resp.status
          })
          return
        }
        console.log('cron.run.completed', {
          cron: controller.cron,
          path,
          status: resp.status
        })
      } catch {
        console.error('cron.run.failed', {
          cron: controller.cron,
          path,
          status: 'request_error'
        })
      }
    }))
  }
}
