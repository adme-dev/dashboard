import { verifyArtifact } from './build-artifact.mjs'
import { verifyReleaseApprovalEnvelope } from './bootstrap-resource-approval.mjs'

export async function runFrozenPagesRelease(input) {
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
  return await input.execute({
    command: 'wrangler',
    args: ['pages', 'deploy', input.artifactDirectory, '--project-name', 'agency-dashboard', '--branch', input.mode === 'production' ? 'main' : 'preview'],
    artifactDigest: input.manifest.artifactDigest
  })
}
