import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  throw new Error('crm_search_evidence_noncanonical')
}

export function createEvidenceBundle(evidence) {
  const bytes = Buffer.from(canonical(evidence), 'utf8')
  return Object.freeze({
    version: 'crm-search-release-evidence-v1',
    evidence,
    evidenceBundleHash: createHash('sha256').update(bytes).digest('hex')
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run')) throw new Error('crm_search_evidence_dry_run_required')
  console.log(JSON.stringify({ status: 'evidence-plan-only', mutationCount: 0 }))
}
