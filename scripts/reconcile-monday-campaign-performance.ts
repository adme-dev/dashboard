/**
 * Cutover helper for linking imported Monday campaign jobs to XeroFlow's
 * synced Google/Meta campaigns. Dry-run is the default; pass --apply only
 * after reviewing the exact matches.
 */
import { createMondayCampaignPerformanceDependencies } from '~~/server/utils/mondayCampaignPerformanceStore'
import { reconcileMondayCampaignPerformance } from '~~/server/utils/mondayCampaignPerformanceReconciler'

const apply = process.argv.includes('--apply')
const writeBackMonday = process.argv.includes('--write-back-monday')

async function main() {
  const dependencies = await createMondayCampaignPerformanceDependencies()
  const result = await reconcileMondayCampaignPerformance({ apply, writeBackMonday }, dependencies)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
