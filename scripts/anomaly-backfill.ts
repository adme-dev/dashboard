// scripts/anomaly-backfill.ts
//
// One-off: populate the anomalies table for the connected Xero org without
// triggering notifications. Run AFTER deploying the cron + notify wiring
// (PR 3) but BEFORE enabling the cron trigger in the Cloudflare dashboard.
//
// After backfill:
//   1. The anomalies table reflects the current state of the org's data.
//   2. Enabling the cron causes only genuinely-NEW incidents (post-backfill)
//      to trigger notifications.
//
// Usage (from the worktree root):
//   pnpm dev    # in another terminal — sharedData.ts hits Nitro routes via $fetch
//   ANOMALY_NOTIFICATIONS_DISABLED=true \
//     pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/anomaly-backfill.ts
//
// The `--tsconfig .nuxt/tsconfig.server.json` flag is required so tsx can
// resolve the `~~/` alias used by the detection layer.
//
// The `ANOMALY_NOTIFICATIONS_DISABLED=true` env is the safety guard — the
// script refuses to run without it, to prevent accidental notification flood.

// $fetch polyfill — Nuxt's $fetch is a runtime global, not available in tsx.
// We point ofetch at the local dev server (or a deployed origin via BACKFILL_BASE_URL)
// so server/utils/anomalyDetection/sharedData.ts can hit /api/xero/* routes.
import { ofetch } from 'ofetch'
const baseURL = process.env.BACKFILL_BASE_URL || 'http://localhost:3000'
;(globalThis as any).$fetch = ofetch.create({ baseURL })

async function main() {
  if (process.env.ANOMALY_NOTIFICATIONS_DISABLED !== 'true') {
    console.error(
      '\n[backfill] REFUSING to run.\n' +
      '  ANOMALY_NOTIFICATIONS_DISABLED must be set to "true" to suppress notifications during backfill.\n' +
      '  Re-run as:  ANOMALY_NOTIFICATIONS_DISABLED=true tsx scripts/anomaly-backfill.ts\n',
    )
    process.exit(1)
  }

  // Lazy-import inside main so the env-flag guard runs first.
  // tsx resolves ~~/ via the project tsconfig paths.
  const { runDetectionForTenant } = await import('../server/utils/anomalyDetection/runForTenant')
  const { queryOne } = await import('../server/utils/db')

  const conn = await queryOne<{ tenant_id: string; tenant_name: string; timezone: string }>(
    `SELECT tenant_id, tenant_name, timezone FROM xero_org_connection
     ORDER BY connected_at DESC LIMIT 1`,
  )
  if (!conn) {
    console.error('[backfill] No Xero org connection found.')
    process.exit(1)
  }

  console.log(`[backfill] Running detection for tenant=${conn.tenant_id} (${conn.tenant_name || 'no name'}) tz=${conn.timezone}`)
  console.log('[backfill] Notifications: SUPPRESSED via ANOMALY_NOTIFICATIONS_DISABLED=true\n')

  const start = Date.now()
  const result = await runDetectionForTenant(conn.tenant_id, { event: null })
  const durationMs = Date.now() - start

  console.log('\n[backfill] Result:')
  console.log(JSON.stringify(result, null, 2))
  console.log(`\n[backfill] Duration: ${(durationMs / 1000).toFixed(1)}s`)

  if (result.status === 'in_flight') {
    console.error('\n[backfill] Detection was already in-flight (KV scan lock held). Either wait 5 minutes or release the lock manually.')
    process.exit(1)
  }
  if (result.status === 'error') {
    console.error('\n[backfill] Detection errored:', result.error)
    process.exit(1)
  }

  console.log('\n[backfill] Done. Next steps:')
  console.log('  1. Verify rows in the anomalies table (psql + SELECT COUNT(*) FROM anomalies).')
  console.log('  2. Enable the cron trigger in the Cloudflare dashboard:')
  console.log('       Workers & Pages → agency-dashboard → Settings → Triggers → Cron.')
  console.log('     Schedule: 0 * * * *  (handler self-gates to 7am tenant-local).')
}

main().catch((err) => {
  console.error('[backfill] Fatal:', err)
  process.exit(1)
})
