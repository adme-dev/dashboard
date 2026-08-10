import { pathToFileURL } from 'node:url'

export async function planPreviewCleanup({ dryRun = true, ownedResources }) {
  if (!dryRun) throw new Error('crm_search_cleanup_external_mutation_disabled_task18')
  if (!Array.isArray(ownedResources)) throw new Error('crm_search_cleanup_inventory_required')
  return { dryRun: true, mutationCount: 0, ownedResources: [...ownedResources].sort() }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run')) throw new Error('crm_search_cleanup_dry_run_required')
  console.log(JSON.stringify({ status: 'cleanup-plan-only', mutationCount: 0 }))
}
