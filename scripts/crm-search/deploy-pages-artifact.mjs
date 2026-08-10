import path from 'node:path'

import { verifyFrozenArtifactEnvelope } from './build-artifact.mjs'
import {
  assertFreshProductionApprovalReadback,
  verifyReleaseApprovalEnvelope
} from './bootstrap-resource-approval.mjs'
import { verifyReleaseEvidenceForApproval } from './evidence-bundle.mjs'

export async function runFrozenPagesRelease(input) {
  if (!input.manifestEnvelope) throw new Error('crm_search_release_manifest_required')
  if (!input.approvalEnvelope || !input.approvalVerification) {
    throw new Error('crm_search_release_approval_required')
  }
  const approval = await verifyReleaseApprovalEnvelope(
    input.approvalEnvelope,
    { ...input.approvalVerification, expectedType: 'production_deploy' }
  )
  const verified = verifyFrozenArtifactEnvelope(input.manifestEnvelope, input.artifactVerification)
  const manifest = verified.manifest
  if (approval.environment !== input.mode) throw new Error('crm_search_release_environment_mismatch')
  if (approval.implementationGitSha !== manifest.implementationSha
    || approval.artifactManifestDigest !== verified.artifactManifestDigest
    || approval.pagesBundleDigest !== verified.pagesBundleDigest
    || approval.workerBundleDigest !== verified.workerBundleDigest
    || approval.bindingManifestDigest !== manifest.bindingManifestDigest) {
    throw new Error('crm_search_release_approval_drift')
  }
  if (input.mode === 'production') {
    if (!input.evidenceBundle || !input.evidenceKeyring) {
      throw new Error('crm_search_release_evidence_required')
    }
    verifyReleaseEvidenceForApproval(input.evidenceBundle, input.evidenceKeyring, {
      mode: input.mode, approval, artifact: verified
    })
  }
  if (typeof input.execute !== 'function') throw new Error('crm_search_release_executor_required')
  if (input.mode === 'production') {
    if (typeof input.readCurrentApproval !== 'function') {
      throw new Error('crm_search_release_approval_readback_required')
    }
    const readback = await input.readCurrentApproval({
      approvalId: approval.approvalId,
      approvalRevision: approval.approvalRevision
    })
    assertFreshProductionApprovalReadback(readback, approval, input.currentTime?.() ?? Date.now())
  }
  const artifactDirectory = path.join(
    input.artifactVerification.artifactRoot,
    manifest.pages.directory
  )
  const artifactRoot = input.artifactVerification.artifactRoot
  return await input.execute({
    command: 'wrangler',
    args: [
      'pages', 'deploy', artifactDirectory, '--project-name', 'agency-dashboard',
      '--branch', input.mode === 'production' ? 'main' : 'preview',
      '--config', path.join(artifactRoot, 'config', 'pages.toml'), '--cwd', artifactRoot
    ],
    artifactDigest: verified.artifactManifestDigest
  })
}
