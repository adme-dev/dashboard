import { mkdtempSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { tmpdir } from 'node:os'

import {
  FROZEN_BUILD_COMMAND,
  releaseToolDigest,
  sha256File,
  verifyFrozenArtifactEnvelope
} from './build-artifact.mjs'
import {
  assertFreshProductionApprovalReadback,
  verifyReleaseApprovalEnvelope
} from './bootstrap-resource-approval.mjs'
import { verifyReleaseEvidenceForApproval } from './evidence-bundle.mjs'
import {
  finalizeProductionDeploymentApproval,
  readCurrentProductionApproval,
  recordProductionDeploymentPhase
} from '../deploy-pages.mjs'

export async function runFrozenConsumerUpload(input) {
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
  const expectedName = input.mode === 'production'
    ? 'agency-crm-search-consumer'
    : 'agency-crm-search-consumer-preview'
  if (input.resourceManifest?.worker?.name !== expectedName) {
    throw new Error('crm_search_worker_target_mismatch')
  }
  if (typeof input.readCurrentApproval !== 'function'
    || typeof input.recordDeploymentPhase !== 'function'
    || (input.mode === 'production' && typeof input.finalizeDeploymentApproval !== 'function')) {
    throw new Error('crm_search_release_approval_readback_required')
  }
  const artifactRoot = input.artifactVerification.artifactRoot
  const entrypoint = path.join(artifactRoot, manifest.worker.entrypoint)
  const configPath = path.resolve(input.configPath)
  if (configPath !== path.join(artifactRoot, 'config', 'worker.toml')) {
    throw new Error('crm_search_worker_config_untrusted')
  }
  const environmentArgs = input.mode === 'preview' ? ['--env', 'preview'] : []
  const runPhase = async ({ phase, readbackPhase, command, validate }) => {
    const readback = await input.readCurrentApproval({
      approvalId: approval.approvalId,
      approvalRevision: approval.approvalRevision,
      phase: readbackPhase
    })
    assertFreshProductionApprovalReadback(readback, approval, input.currentTime?.() ?? Date.now())
    await input.recordDeploymentPhase({
      approvalId: approval.approvalId, approvalRevision: approval.approvalRevision,
      phase, status: 'started', artifactManifestDigest: verified.artifactManifestDigest
    })
    try {
      const result = await input.execute(command)
      validate(result)
      await input.recordDeploymentPhase({
        approvalId: approval.approvalId, approvalRevision: approval.approvalRevision,
        phase, status: 'succeeded', artifactManifestDigest: verified.artifactManifestDigest,
        ...(result.versionId ? { versionId: result.versionId } : {}),
        ...(result.deploymentId ? { deploymentId: result.deploymentId } : {})
      })
      return result
    } catch (error) {
      await input.recordDeploymentPhase({
        approvalId: approval.approvalId, approvalRevision: approval.approvalRevision,
        phase, status: 'failed', artifactManifestDigest: verified.artifactManifestDigest,
        failureCode: 'external_spawn_failed'
      })
      throw error
    }
  }
  const upload = await runPhase({
    phase: 'worker_upload', readbackPhase: 'before-worker-upload',
    command: {
      command: 'wrangler',
      args: [
        'versions', 'upload', entrypoint, '--no-bundle',
        '--config', configPath, '--cwd', artifactRoot,
        ...environmentArgs
      ],
      artifactDigest: verified.artifactManifestDigest
    },
    validate: (result) => {
      if (!/^[A-Za-z0-9._-]{1,128}$/u.test(result?.versionId ?? '')) {
        throw new Error('crm_search_worker_version_readback_required')
      }
    }
  })
  const activation = await runPhase({
    phase: 'worker_activate', readbackPhase: 'before-worker-activate',
    command: {
      command: 'wrangler',
      args: [
        'versions', 'deploy', `${upload.versionId}@100%`, '--yes',
        '--config', configPath, '--cwd', artifactRoot,
        ...environmentArgs
      ],
      artifactDigest: verified.artifactManifestDigest,
      versionId: upload.versionId
    },
    validate: (result) => {
      if (result?.versionId !== upload.versionId
        || !/^[A-Za-z0-9._-]{1,128}$/u.test(result?.deploymentId ?? '')) {
        throw new Error('crm_search_worker_activation_readback_required')
      }
    }
  })
  if (input.mode === 'production') {
    await input.finalizeDeploymentApproval({
      approvalId: approval.approvalId,
      approvalRevision: approval.approvalRevision,
      artifactManifestDigest: verified.artifactManifestDigest,
      workerVersionId: upload.versionId,
      workerDeploymentId: activation.deploymentId
    })
  }
  return Object.freeze({
    versionId: upload.versionId,
    deploymentId: activation.deploymentId
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ status: 'upload-plan-only', mutationCount: 0 }))
  } else {
    if (!process.argv.includes('--execute')) throw new Error('crm_search_consumer_upload_dry_run_required')
    const required = [
      'CRM_SEARCH_FROZEN_ARTIFACT_ROOT', 'CRM_SEARCH_FROZEN_ARTIFACT_MANIFEST',
      'CRM_SEARCH_DEPLOYMENT_APPROVAL', 'CRM_SEARCH_ARTIFACT_VERIFICATION_KEYRING',
      'CRM_SEARCH_RELEASE_APPROVAL_VERIFICATION_KEYRING',
      'CRM_SEARCH_RELEASE_APPROVAL_DATABASE_URL', 'CRM_SEARCH_RELEASE_SHA',
      'CRM_SEARCH_RELEASE_EVIDENCE', 'CRM_SEARCH_EVIDENCE_VERIFICATION_KEYRING'
    ]
    if (required.some(name => !process.env[name])) throw new Error('crm_search_consumer_upload_inputs_missing')
    const artifactRoot = path.resolve(process.env.CRM_SEARCH_FROZEN_ARTIFACT_ROOT)
    const repositoryRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
    const treeStatus = spawnSync('git', ['status', '--short'], {
      cwd: repositoryRoot, encoding: 'utf8'
    })
    if (treeStatus.error || treeStatus.status !== 0 || treeStatus.stdout.trim() !== '') {
      throw new Error('crm_search_dirty_tree')
    }
    const manifestEnvelope = JSON.parse(readFileSync(process.env.CRM_SEARCH_FROZEN_ARTIFACT_MANIFEST, 'utf8'))
    const approvalEnvelope = JSON.parse(readFileSync(process.env.CRM_SEARCH_DEPLOYMENT_APPROVAL, 'utf8'))
    const evidenceBundle = JSON.parse(readFileSync(process.env.CRM_SEARCH_RELEASE_EVIDENCE, 'utf8'))
    const approvalVerification = {
      nowMs: Date.now(),
      keyring: JSON.parse(process.env.CRM_SEARCH_RELEASE_APPROVAL_VERIFICATION_KEYRING)
    }
    const outputDirectory = mkdtempSync(path.join(tmpdir(), 'crm-search-worker-release-'))
    let commandSequence = 0
    const execute = ({ command, args, versionId }) => {
      commandSequence += 1
      const outputPath = path.join(outputDirectory, `wrangler-output-${commandSequence}.ndjson`)
      const result = spawnSync('pnpm', ['exec', command, ...args], {
        cwd: artifactRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          WRANGLER_LOG_PATH: path.join(path.dirname(artifactRoot), 'crm-search-worker-upload.log'),
          WRANGLER_OUTPUT_FILE_PATH: outputPath
        }
      })
      if (result.error || result.status !== 0) throw result.error ?? new Error('crm_search_consumer_upload_failed')
      let entries
      try {
        entries = readFileSync(outputPath, 'utf8').trim().split('\n').map(line => JSON.parse(line))
      } catch {
        throw new Error('crm_search_worker_release_readback_required')
      }
      if (args[1] === 'upload') {
        const output = entries.find(entry => entry?.type === 'version-upload')
        return { versionId: output?.version_id }
      }
      const output = entries.find(entry => entry?.type === 'version-deploy')
      return { versionId, deploymentId: output?.deployment_id }
    }
    await runFrozenConsumerUpload({
      mode: 'production',
      manifestEnvelope,
      artifactVerification: {
        artifactRoot,
        expectedPins: {
          implementationSha: process.env.CRM_SEARCH_RELEASE_SHA,
          nodeVersion: process.versions.node,
          lockfileDigest: sha256File(path.join(repositoryRoot, 'pnpm-lock.yaml')),
          buildCommandDigest: createHash('sha256').update(FROZEN_BUILD_COMMAND).digest('hex'),
          toolDigest: releaseToolDigest(repositoryRoot),
          pagesConfigDigest: sha256File(path.join(repositoryRoot, 'wrangler.toml')),
          workerConfigDigest: sha256File(path.join(repositoryRoot, 'workers/crm-search-consumer/wrangler.toml')),
          bindingManifestDigest: approvalEnvelope.payload.bindingManifestDigest
        },
        keyring: JSON.parse(process.env.CRM_SEARCH_ARTIFACT_VERIFICATION_KEYRING)
      },
      approvalEnvelope,
      approvalVerification,
      evidenceBundle,
      evidenceKeyring: JSON.parse(process.env.CRM_SEARCH_EVIDENCE_VERIFICATION_KEYRING),
      readCurrentApproval: ({ approvalId, approvalRevision }) => readCurrentProductionApproval({
        databaseUrl: process.env.CRM_SEARCH_RELEASE_APPROVAL_DATABASE_URL,
        approvalId,
        approvalRevision
      }),
      recordDeploymentPhase: event => recordProductionDeploymentPhase({
        databaseUrl: process.env.CRM_SEARCH_RELEASE_APPROVAL_DATABASE_URL,
        approval: approvalEnvelope.payload,
        event
      }),
      finalizeDeploymentApproval: () => finalizeProductionDeploymentApproval({
        databaseUrl: process.env.CRM_SEARCH_RELEASE_APPROVAL_DATABASE_URL,
        approval: approvalEnvelope.payload
      }),
      resourceManifest: { worker: { name: 'agency-crm-search-consumer' } },
      configPath: path.join(artifactRoot, 'config', 'worker.toml'),
      execute
    })
  }
}
