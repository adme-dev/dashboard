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
  if (typeof input.readCurrentApproval !== 'function'
    || typeof input.recordDeploymentPhase !== 'function') {
    throw new Error('crm_search_release_approval_readback_required')
  }
  const artifactDirectory = path.join(
    input.artifactVerification.artifactRoot,
    manifest.pages.directory
  )
  const artifactRoot = input.artifactVerification.artifactRoot
  const phase = 'pages'
  const readback = await input.readCurrentApproval({
    approvalId: approval.approvalId,
    approvalRevision: approval.approvalRevision,
    phase: 'before-pages-deploy'
  })
  assertFreshProductionApprovalReadback(readback, approval, input.currentTime?.() ?? Date.now())
  await input.recordDeploymentPhase({
    approvalId: approval.approvalId, approvalRevision: approval.approvalRevision,
    phase, status: 'started', artifactManifestDigest: verified.artifactManifestDigest
  })
  try {
    const deployed = await input.execute({
      command: 'wrangler',
      args: [
        'pages', 'deploy', artifactDirectory, '--project-name', 'agency-dashboard',
        '--branch', input.mode === 'production' ? 'main' : 'preview',
        '--config', path.join(artifactRoot, 'config', 'pages.toml'), '--cwd', artifactRoot
      ],
      artifactDigest: verified.artifactManifestDigest
    })
    if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(deployed?.deploymentId ?? '')) {
      throw new Error('crm_search_pages_deployment_readback_required')
    }
    await input.recordDeploymentPhase({
      approvalId: approval.approvalId, approvalRevision: approval.approvalRevision,
      phase, status: 'succeeded', artifactManifestDigest: verified.artifactManifestDigest,
      deploymentId: deployed.deploymentId
    })
    return deployed
  } catch (error) {
    await input.recordDeploymentPhase({
      approvalId: approval.approvalId, approvalRevision: approval.approvalRevision,
      phase, status: 'failed', artifactManifestDigest: verified.artifactManifestDigest,
      failureCode: 'external_spawn_failed'
    })
    throw error
  }
}
