import { pathToFileURL } from 'node:url'

const EXACT_PREVIEW = Object.freeze({
  pagesProject: 'agency-dashboard',
  pagesBranch: 'preview',
  worker: 'agency-crm-search-consumer-preview',
  vectorize: 'agency-crm-search-preview',
  queue: 'agency-crm-search-index-preview',
  deadLetterQueue: 'agency-crm-search-index-preview-dlq',
  retentionSeconds: 1_209_600
})

export function assertPreviewBindingReadback(readback) {
  if (!readback || Object.keys(EXACT_PREVIEW).some(key => readback[key] !== EXACT_PREVIEW[key])) {
    throw new Error('crm_search_preview_binding_readback_mismatch')
  }
  if (!Array.isArray(readback.mutableBindings) || readback.mutableBindings.length === 0) {
    throw new Error('crm_search_preview_binding_inventory_incomplete')
  }
  return { ok: true }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run')) throw new Error('crm_search_preview_guard_dry_run_required')
  console.log(JSON.stringify({ status: 'readback-required', mutationCount: 0, expected: EXACT_PREVIEW }))
}
