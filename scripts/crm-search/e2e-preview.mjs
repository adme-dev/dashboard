import { pathToFileURL } from 'node:url'

export async function runPreviewE2E({ dryRun = true, plan, execute }) {
  if (!plan || typeof execute !== 'function') throw new Error('crm_search_preview_plan_invalid')
  if (dryRun) return { dryRun: true, mutationCount: 0, plan }
  throw new Error('crm_search_preview_external_mutation_disabled_task18')
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run')) throw new Error('crm_search_preview_dry_run_required')
  console.log(JSON.stringify({ status: 'preview-plan-only', mutationCount: 0 }))
}
