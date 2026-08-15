// workers/pages-cron/src/index.ts
// Consolidated Cloudflare Cron Worker for the Pages app's HTTP /api/cron/* routes.
//
// The Nitro Cloudflare-Pages build emits no scheduled() handler and Pages cron
// triggers aren't supported in wrangler.toml, so these endpoints can't be driven
// by a Pages dashboard cron. This worker fills the gap (same pattern as
// workers/leads-cron and workers/meta-status-cron): each cron expression fans
// out to one or more endpoints, POSTed with the x-cron-secret header.
//
// NOTE: /api/cron/meta-ad-status-sync is handled by its own worker
// (workers/meta-status-cron) and is intentionally NOT duplicated here.

interface Env {
  APP_BASE_URL: string
  CRON_SECRET: string
}

// One cron expression may drive several endpoints. Keys MUST exactly match the
// crons listed in wrangler.toml (controller.cron is matched verbatim).
export const ROUTES: Record<string, string[]> = {
  // hourly — anomaly handler self-gates to 7am tenant-local; ga4-sync re-pulls
  // the trailing ~14d window (idempotent). ga4-sync was fixed in PR #49 to run
  // concurrently + batch upserts (~33s for 87 properties, was a >150s hang).
  // HR review reminders are delivery-key idempotent, so hourly retries are safe.
  '0 * * * *': [
    '/api/cron/anomaly-detection',
    '/api/cron/ga4-sync',
    '/api/cron/budget-slack-digest',
    '/api/cron/monday-campaign-performance',
    '/api/cron/ops-autopilot-pacing',
    '/api/cron/spend-auto-action',
    '/api/cron/hr-review-reminders',
    '/api/cron/monday-reconcile',
    '/api/cron/monday-health-notifications',
    '/api/cron/site-intelligence'
  ],
  // hourly at :30 — GA4 richer dimension/event breakdowns. Offset 30 min from
  // ga4-sync to spread GA4 API load; the endpoint self-limits to the 25 stalest
  // properties per run (cursored by ga4_property_map.dimension_synced_at, mig
  // 143), so all properties cycle every ~4h. Idempotent upserts.
  '30 * * * *': ['/api/cron/ga4-dimensions'],
  // every 5 min — office-assistant watch evaluation (own 15-min debounce);
  // video-generation-reconcile polls in-flight async i2v/t2v jobs (finish ~<5min)
  // and finalizes them, with its own 20-min timeout reap.
  '*/5 * * * *': [
    '/api/cron/office-assistant',
    '/api/cron/video-generation-reconcile',
    '/api/cron/monday-webhooks',
    '/api/cron/measurement-outbox-repair',
    '/api/cron/god-mode-reconciliation',
    '/api/cron/memory-index-outbox',
    '/api/cron/crm-search-index-repair'
  ],
  // hourly at :45 — keep the Xero customer cache and rollups fresh. Delta
  // syncs are idempotent and use the shared cron token resolver. Was */15:
  // 96 runs/day × full page-throughs was the main burner of the 5,000/day
  // Xero API quota (exhausted by mid-morning, 2026-08-10). Hourly + real
  // If-Modified-Since deltas keeps the cache fresh at ~1% of the cost.
  '45 * * * *': ['/api/cron/xero-customer-sync'],
  // daily — refresh entitled Search Console evidence and inspect up to 50
  // priority URLs per client using Google's indexed-version inspection result.
  '15 2 * * *': ['/api/cron/search-console-sync'],
  // daily — optional Google Business Profile Performance API evidence. The
  // endpoint is a safe no-op until provider access is explicitly enabled.
  '40 2 * * *': ['/api/cron/google-business-performance'],
  // daily — refresh the Xero invoice line-item cache (AGI / True Position).
  // Syncs current + previous month so month-end backdated entries are caught.
  '20 3 * * *': ['/api/cron/xero-invoice-lines-sync'],
  // daily — office meeting/recording cleanup plus bounded, legal-hold-aware
  // CRM-search governed retention. Both endpoints are independently idempotent.
  '35 3 * * *': [
    '/api/cron/office-retention',
    '/api/cron/crm-search-retention'
  ],
  // daily — purge tracking_events past each site's retention_days
  '45 3 * * *': ['/api/cron/tracking-retention'],
  // daily — recompute hot/warm/cold intent-tier membership from the last 30
  // days of customer signals, feeding tier-filtered Meta/Google audience
  // exports. Full delete+reinsert per client inside one transaction.
  '55 3 * * *': ['/api/cron/persona-tier-recompute'],
  // daily — create review-only Auto Feed drafts. The endpoint is a no-op until
  // DEALER_FEEDS_ENABLED is set and deduplicates every feed item per rule.
  '10 4 * * *': ['/api/cron/feed-post-rules'],
  // daily 6am UTC — ad-spend sync. Meta fans out per account via queue; other
  // platforms run as background syncs. The endpoint returns immediately so this
  // never hits the function time limit. Replaces the ai-agent-worker path,
  // which ran every platform synchronously and never completed.
  '0 6 * * *': ['/api/cron/sync-spend'],
  // daily 6:30am UTC — read-only Google Search campaign AI Max readiness.
  // Offset from spend sync to avoid overlapping Google API bursts. Internal
  // notifications remain dormant unless the Pages enable flag is armed.
  '30 6 * * *': ['/api/cron/google-ai-max-readiness']
}

export default {
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const paths = ROUTES[controller.cron]
    if (!paths) {
      console.warn('pages-cron: unknown cron', controller.cron)
      return
    }
    await Promise.all(
      paths.map(async (path) => {
        try {
          const resp = await fetch(`${env.APP_BASE_URL}${path}`, {
            method: 'POST',
            headers: { 'x-cron-secret': env.CRON_SECRET }
          })
          const text = await resp.text()
          console.log('pages-cron.run', {
            cron: controller.cron,
            path,
            status: resp.status,
            body: text.slice(0, 200)
          })
        } catch (err) {
          console.error('pages-cron.error', { cron: controller.cron, path, error: String(err) })
        }
      })
    )
  }
}
