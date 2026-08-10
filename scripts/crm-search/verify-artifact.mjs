import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { verifyArtifact } from './build-artifact.mjs'

export function verifyFrozenArtifact({ manifestPath, actual }) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  return verifyArtifact(manifest, actual)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run')) throw new Error('crm_search_artifact_verify_dry_run_required')
  console.log(JSON.stringify({ status: 'verification-plan-only', mutationCount: 0 }))
}
