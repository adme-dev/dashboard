/**
 * Interim Meta spend refresh — runs the bulk sequential sync from a RESIDENTIAL
 * machine against the prod DB.
 *
 * Why: while the app's Marketing API access tier is `development_access`, the
 * Meta Graph API returns empty insights from Cloudflare's data-center egress, so
 * the production cron writes $0. The identical call returns real data from a
 * residential IP. This script keeps the dashboard's Meta numbers current until
 * the Advanced Access upgrade is granted (after which prod syncs on its own).
 *
 * Usage (from the repo root, residential network):
 *   export DATABASE_URL=$(grep '^DATABASE_URL' .env | cut -d= -f2-)
 *   pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/refresh-meta-spend.ts [month] [year]
 *
 * Then bust the KV summary cache (or wait 5 min for the 300s TTL):
 *   wrangler kv key delete --namespace-id 7d5db1c489cb40f4b809d611e1408acd "spend:summary:no-tenant:<period>:all" --remote
 */
import { syncMetaSpend } from '~~/server/utils/spendSync'

const month = Number(process.argv[2] || new Date().getMonth() + 1)
const year = Number(process.argv[3] || new Date().getFullYear())
const period = `${year}-${String(month).padStart(2, '0')}`

async function main() {
  console.log(`[refresh-meta-spend] syncing Meta spend for ${period} (residential, sequential)...`)
  const result = await syncMetaSpend(month, year)
  console.log(
    `[refresh-meta-spend] DONE — synced ${result.synced} campaigns, $${result.totalSpend}, ` +
    `${result.failures.length} failure(s)`
  )
  if (result.failures.length) {
    console.log('[refresh-meta-spend] failures (first 8):', JSON.stringify(result.failures.slice(0, 8), null, 2))
  }
  process.exit(0)
}

main().catch((e) => {
  console.error('[refresh-meta-spend] ERROR:', e)
  process.exit(1)
})
