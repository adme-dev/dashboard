import { pathToFileURL } from 'node:url'

import { verifyArtifact } from './build-artifact.mjs'
import { verifyReleaseApprovalEnvelope } from './bootstrap-resource-approval.mjs'

export async function runFrozenConsumerUpload(input) {
  if (!input.manifest) throw new Error('crm_search_release_manifest_required')
  if (!input.approvalEnvelope || !input.approvalVerification) {
    throw new Error('crm_search_release_approval_required')
  }
  const approval = await verifyReleaseApprovalEnvelope(
    input.approvalEnvelope,
    { ...input.approvalVerification, expectedType: 'production_deploy' }
  )
  if (approval.environment !== input.mode) throw new Error('crm_search_release_environment_mismatch')
  if (approval.implementationGitSha !== input.manifest.implementationSha
    || approval.artifactManifestDigest !== input.manifest.artifactDigest
    || approval.bindingManifestDigest !== input.manifest.bindingManifestDigest) {
    throw new Error('crm_search_release_approval_drift')
  }
  verifyArtifact(input.manifest, input.actual ?? input.manifest)
  if (typeof input.execute !== 'function') throw new Error('crm_search_release_executor_required')
  const expectedName = input.mode === 'production'
    ? 'agency-crm-search-consumer'
    : 'agency-crm-search-consumer-preview'
  if (input.resourceManifest?.worker?.name !== expectedName) {
    throw new Error('crm_search_worker_target_mismatch')
  }
  return await input.execute({
    command: 'wrangler',
    args: [
      'versions', 'upload',
      '--env', input.mode === 'preview' ? 'preview' : '',
      '--config', input.configPath
    ],
    artifactDigest: input.manifest.artifactDigest
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run')) throw new Error('crm_search_consumer_upload_dry_run_required')
  console.log(JSON.stringify({ status: 'upload-plan-only', mutationCount: 0 }))
}
