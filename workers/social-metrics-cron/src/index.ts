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
      signal: AbortSignal.timeout(240_000),
    })
    if (!resp.ok) throw new Error(`social-metrics-cron: HTTP ${resp.status}`)
    const result = await resp.json() as {
      ok?: boolean
      accountsSynced?: number
      postsSynced?: number
      health?: { status?: string }
    }
    if (result.ok !== true || !['healthy', 'warning'].includes(result.health?.status ?? '')) {
      throw new Error(`social-metrics-cron: collector ${result.health?.status === 'critical' ? 'critical' : 'invalid response'}`)
    }
    console.log('social-metrics-cron.run', {
      status: resp.status,
      health: result.health.status,
      accountsSynced: result.accountsSynced,
      postsSynced: result.postsSynced,
    })
  },
}
