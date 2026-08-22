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
import { completeSpendSyncJob, createSpendSyncJob, failSpendSyncJob } from '~~/server/utils/spendSyncJobs'

const month = Number(process.argv[2] || new Date().getMonth() + 1)
const year = Number(process.argv[3] || new Date().getFullYear())
const period = `${year}-${String(month).padStart(2, '0')}`

async function main() {
  console.log(`[refresh-meta-spend] syncing Meta spend for ${period} (residential, sequential)...`)
  // Record this run as a real spend_sync_jobs row: the read-side coverage baseline and the
  // get_sync_status history come from completed job rows, so a residential refresh that only
  // wrote media_spend left Meta's baseline June-vintage and every Meta read halted (2026-08-22).
  const jobId = await createSpendSyncJob('meta', period, null)
  let result: Awaited<ReturnType<typeof syncMetaSpend>>
  try {
    result = await syncMetaSpend(month, year)
  } catch (e) {
    await failSpendSyncJob(jobId, e instanceof Error ? e.message : String(e)).catch(() => {})
    throw e
  }
  await completeSpendSyncJob(jobId, result)
  console.log(`[refresh-meta-spend] recorded spend_sync_jobs ${jobId} (baseline advances)`)
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
