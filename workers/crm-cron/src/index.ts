// workers/crm-cron/src/index.ts
// Cloudflare Cron Worker — fires the CRM activation cron endpoints on a schedule.
// The Nitro Cloudflare-Pages build has no scheduled() handler, so this companion
// Worker fills the gap (same pattern as workers/meta-status-cron, leads-cron).
//
// Each endpoint self-gates (x-cron-secret) and is idempotent:
//   * crm-task-reminders   — notifies due CRM-task reminders (anti-flood drained)
//   * crm-score-decay      — recomputes stale lead scores so recency erodes
//   * crm-dormancy         — moves inactive 'active' contacts to 'dormant'
//   * crm-health-recompute — refreshes customer health / churn-risk scores
// Hourly fire is cheap: decay only touches scores older than 20h, reminders fire
// once (reminded_at), dormancy is a no-op once a contact has transitioned, and
// health upserts are idempotent.

interface Env {
  APP_BASE_URL: string
  CRON_SECRET: string
}

const JOBS = ['crm-task-reminders', 'crm-score-decay', 'crm-dormancy', 'crm-health-recompute'] as const

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    for (const job of JOBS) {
      try {
        const resp = await fetch(`${env.APP_BASE_URL}/api/cron/${job}`, {
          method: 'POST',
          headers: { 'x-cron-secret': env.CRON_SECRET },
        })
        const text = await resp.text()
        console.log('crm-cron.run', { job, status: resp.status, body: text.slice(0, 200) })
      } catch (e) {
        console.error('crm-cron.error', { job, error: String(e) })
      }
    }
  },
}
