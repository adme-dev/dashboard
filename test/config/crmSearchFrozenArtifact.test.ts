import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  createArtifactManifest,
  buildFrozenArtifact,
  verifyFrozenArtifactEnvelope,
  runArtifactBuild,
  verifyArtifact
} from '../../scripts/crm-search/build-artifact.mjs'
import {
  canonicalBootstrapApprovalPayload,
  verifyBootstrapResourceApproval
} from '../../scripts/crm-search/bootstrap-resource-approval.mjs'
import { runFrozenPagesRelease } from '../../scripts/crm-search/deploy-pages-artifact.mjs'
import { runFrozenConsumerUpload } from '../../scripts/crm-search/deploy-consumer-artifact.mjs'
import {
  createEvidenceBundle,
  verifyEvidenceBundle
} from '../../scripts/crm-search/evidence-bundle.mjs'

const sha = 'a'.repeat(40)
const digest = (value: string) => `${value.repeat(64)}`
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const canonical = (value: unknown): string => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  throw new Error('noncanonical fixture')
}
const cleanupEvidence = () => {
  const journal = [{
    resourceType: 'vectorize', resourceIdentityDigest: digest('a'),
    baselineDigest: digest('b'), finalReadbackDigest: digest('b'),
    status: 'baseline_restored', confirmedAt: '2026-08-11T00:59:59.000Z'
  }]
  return {
    journalVersion: 'crm-search-cleanup-journal-v1', journal,
    journalDigest: sha256(canonical(journal)),
    confirmedAt: '2026-08-11T00:59:59.000Z', remainingMutableTargets: 0
  }
}

async function frozenArtifactFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'crm-search-artifact-'))
  const outputDirectory = path.join(root, 'release')
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const categories = [
    'ai', 'analytics_engine_datasets', 'browser', 'd1_databases', 'durable_objects', 'hyperdrive',
    'kv_namespaces', 'queues', 'r2_buckets', 'secrets', 'services', 'vars', 'vectorize'
  ]
  const integrationNames = [
    'database', 'provider_apis', 'ai_gateway', 'mcp', 'meta', 'google', 'meta_audiences',
    'google_audiences', 'xero', 'email_delivery', 'monday', 'slack',
    'outbound_webhooks', 'google_sheets', 'social_dashboard'
  ]
  const pagesConfig = `name = "agency-dashboard"
[[r2_buckets]]
binding = "FILES"
bucket_name = "prod-files"
[env.production]
[[env.production.r2_buckets]]
binding = "FILES"
bucket_name = "prod-files"
[env.preview]
[[env.preview.r2_buckets]]
binding = "FILES"
bucket_name = "preview-files"
`
  const bindingManifest = JSON.stringify({
    pagesProject: 'agency-dashboard', pagesBranch: 'preview',
    worker: 'agency-crm-search-consumer-preview', vectorize: 'agency-crm-search-preview',
    queue: 'agency-crm-search-index-preview',
    deadLetterQueue: 'agency-crm-search-index-preview-dlq', retentionSeconds: 1_209_600,
    mutableBindings: ['FILES'],
    pagesInventory: {
      version: 'crm-search-pages-environment-inventory-v1',
      production: {
        environment: 'production', categories,
        integrations: integrationNames.map(name => ({
          name, state: 'disabled', targetIdentityDigest: null,
          verifiedAt: '2026-08-11T00:00:00.000Z'
        })),
        bindings: [
          { category: 'r2_buckets', binding: 'FILES', target: 'prod-files' },
          { category: 'secrets', binding: 'DATABASE_URL', target: '1'.repeat(64) }
        ]
      },
      preview: {
        environment: 'preview', categories,
        integrations: integrationNames.map(name => ({
          name, state: 'disabled', targetIdentityDigest: null,
          verifiedAt: '2026-08-11T00:00:00.000Z'
        })),
        bindings: [
          { category: 'r2_buckets', binding: 'FILES', target: 'preview-files' },
          { category: 'secrets', binding: 'DATABASE_URL', target: '2'.repeat(64) }
        ]
      }
    }
  })
  const config = {
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'build-command.txt': 'pnpm build\npnpm worker:bundle\n',
    'tool.json': '{"wrangler":"4.110.0"}\n',
    'pages.toml': pagesConfig,
    'worker.toml': 'name = "agency-crm-search-consumer"\n',
    'binding-manifest.json': `${bindingManifest}\n`
  }
  const pins = {
    implementationSha: sha,
    nodeVersion: '24.18.0',
    lockfileDigest: sha256(config['pnpm-lock.yaml']),
    buildCommandDigest: sha256(config['build-command.txt']),
    toolDigest: sha256(config['tool.json']),
    pagesConfigDigest: sha256(config['pages.toml']),
    workerConfigDigest: sha256(config['worker.toml']),
    bindingManifestDigest: sha256(config['binding-manifest.json'])
  }
  const buildPages = vi.fn(({ outputDirectory: directory }) => {
    mkdirSync(directory, { recursive: true })
    writeFileSync(path.join(directory, '_worker.js'), 'export default { fetch() {} }\n')
  })
  const buildConsumer = vi.fn(({ outputDirectory: directory }) => {
    mkdirSync(directory, { recursive: true })
    writeFileSync(path.join(directory, 'worker.mjs'), 'export default { queue() {} }\n')
  })
  const stageProvenance = vi.fn(({ outputDirectory: directory }) => {
    mkdirSync(directory, { recursive: true })
    for (const [name, contents] of Object.entries(config)) writeFileSync(path.join(directory, name), contents)
  })
  const manifestEnvelope = await buildFrozenArtifact({
    expectedSha: sha, actualSha: sha, cleanTree: true, detachedHead: true,
    outputDirectory, pins, signing: { keyVersion: 'artifact-2026-08', privateKey },
    buildPages, buildConsumer, stageProvenance
  })
  const artifactVerification = {
    artifactRoot: outputDirectory,
    expectedPins: pins,
    keyring: {
      version: 'crm-search-artifact-verification-keyring-v1',
      activeKeyVersion: 'artifact-2026-08',
      keys: {
        'artifact-2026-08': publicKey.export({ type: 'spki', format: 'der' }).toString('base64url')
      }
    }
  }
  return { manifestEnvelope, artifactVerification, pins, buildPages, buildConsumer, stageProvenance }
}

describe('CRM search frozen release artifact', () => {
  it('builds, signs, and verifies one canonical exact-file Pages and Worker artifact without rebuilding', async () => {
    const {
      manifestEnvelope: envelope, artifactVerification, pins,
      buildPages, buildConsumer, stageProvenance
    } = await frozenArtifactFixture()
    expect(buildPages).toHaveBeenCalledTimes(1)
    expect(buildConsumer).toHaveBeenCalledTimes(1)
    expect(stageProvenance).toHaveBeenCalledTimes(1)
    expect(envelope.payload.pages.files).toEqual([
      { path: '_worker.js', size: 30, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }
    ])
    expect(envelope.payload.pages.sizeEvidence).toMatchObject({
      rawBytes: 30,
      gzipBytes: expect.any(Number),
      rawBudgetBytes: 25 * 1024 * 1024 - 256 * 1024,
      gzipBudgetBytes: 9_750_000,
      guardScriptSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
    expect(envelope.payload.worker.entrypoint).toBe('worker/worker.mjs')
    expect(verifyFrozenArtifactEnvelope(envelope, artifactVerification)).toMatchObject({
      ok: true, pagesBundleDigest: expect.any(String), workerBundleDigest: expect.any(String),
      manifest: expect.objectContaining(pins)
    })
  })

  it('builds Pages and the consumer exactly once only from the clean detached committed SHA', async () => {
    const buildPages = vi.fn().mockResolvedValue({ artifactDigest: digest('b') })
    const buildConsumer = vi.fn().mockResolvedValue({ artifactDigest: digest('c') })

    await expect(runArtifactBuild({
      expectedSha: sha,
      actualSha: sha,
      cleanTree: true,
      detachedHead: true,
      nodeVersion: '24.18.0',
      buildPages,
      buildConsumer
    })).resolves.toEqual({
      pages: { artifactDigest: digest('b') },
      consumer: { artifactDigest: digest('c') }
    })
    expect(buildPages).toHaveBeenCalledTimes(1)
    expect(buildConsumer).toHaveBeenCalledTimes(1)

    buildPages.mockClear()
    buildConsumer.mockClear()
    await expect(runArtifactBuild({
      expectedSha: sha,
      actualSha: sha,
      cleanTree: false,
      detachedHead: true,
      nodeVersion: '24.18.0',
      buildPages,
      buildConsumer
    })).rejects.toThrow('crm_search_dirty_tree')
    expect(buildPages).not.toHaveBeenCalled()
    expect(buildConsumer).not.toHaveBeenCalled()
  })

  it('binds the build to exact clean SHA, Node, lockfile, tool and config digests', () => {
    const manifest = createArtifactManifest({
      implementationSha: sha,
      nodeVersion: '24.18.0',
      cleanTree: true,
      artifactDigest: digest('b'),
      lockfileDigest: digest('c'),
      buildCommandDigest: digest('d'),
      toolDigest: digest('e'),
      pagesConfigDigest: digest('f'),
      workerConfigDigest: digest('1'),
      bindingManifestDigest: digest('2')
    })
    expect(verifyArtifact(manifest, {
      implementationSha: sha,
      nodeVersion: '24.18.0',
      cleanTree: true,
      artifactDigest: digest('b'),
      bindingManifestDigest: digest('2')
    })).toEqual({ ok: true })
    expect(() => verifyArtifact(manifest, {
      implementationSha: sha,
      nodeVersion: '24.18.0',
      cleanTree: true,
      artifactDigest: digest('9'),
      bindingManifestDigest: digest('2')
    })).toThrow('artifact_digest_mismatch')
  })

  it('verifies a trusted Ed25519 bootstrap envelope and recomputes provenance', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const payload = {
      type: 'resource_provision',
      environment: 'production',
      originalTimestamp: '2026-08-11T00:00:00.000Z',
      expiresAt: '2026-08-12T00:00:00.000Z',
      implementationGitSha: sha,
      artifactManifestDigest: digest('b'),
      bindingManifestDigest: digest('c'),
      evidenceBundleHash: digest('d'),
      organisationScopeId: '20000000-0000-4000-8000-000000000001',
      requestedByActorId: '10000000-0000-4000-8000-000000000001',
      approvedBy: '30000000-0000-4000-8000-000000000001',
      maximumCostUsdMicros: 25_000_000,
      clientIds: [],
      reason: 'Approve exact CRM search production resources'
    } as const
    const bytes = canonicalBootstrapApprovalPayload(payload)
    const envelope = {
      version: 'crm-search-bootstrap-approval-envelope-v1',
      keyVersion: 'release-2026-08',
      payload,
      signature: sign(null, bytes, privateKey).toString('base64url')
    }
    const verified = await verifyBootstrapResourceApproval(envelope, {
      nowMs: Date.parse('2026-08-11T01:00:00.000Z'),
      keyring: {
        version: 'crm-search-bootstrap-verification-keyring-v1',
        activeKeyVersion: 'release-2026-08',
        keys: {
          'release-2026-08': {
            algorithm: 'Ed25519',
            publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
            notBefore: '2026-08-10T00:00:00.000Z',
            notAfter: '2026-08-20T00:00:00.000Z'
          }
        }
      }
    })
    expect(verified).toMatchObject({
      type: 'resource_provision',
      originalTimestamp: payload.originalTimestamp,
      importedProvenanceHash: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
    await expect(verifyBootstrapResourceApproval(envelope, {
      nowMs: Date.parse('2026-08-11T01:00:00.000Z'),
      keyring: {
        version: 'wrong',
        activeKeyVersion: 'release-2026-08',
        keys: {
          'release-2026-08': {
            algorithm: 'Ed25519',
            publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
            notBefore: '2026-08-10T00:00:00.000Z',
            notAfter: '2026-08-20T00:00:00.000Z'
          }
        }
      }
    })).rejects.toThrow('crm_search_bootstrap_key_unavailable')
    await expect(verifyBootstrapResourceApproval({
      ...envelope,
      payload: { ...payload, maximumCostUsdMicros: 25_000_001 }
    }, {
      nowMs: Date.parse('2026-08-11T01:00:00.000Z'),
      keyring: {
        version: 'crm-search-bootstrap-verification-keyring-v1',
        activeKeyVersion: 'release-2026-08',
        keys: {
          'release-2026-08': {
            algorithm: 'Ed25519',
            publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
            notBefore: '2026-08-10T00:00:00.000Z',
            notAfter: '2026-08-20T00:00:00.000Z'
          }
        }
      }
    })).rejects.toThrow('crm_search_bootstrap_signature_invalid')
  })

  it('rejects before mutation unless the exact verified artifact and approval are injected', async () => {
    const execute = vi.fn()
    await expect(runFrozenPagesRelease({
      mode: 'production',
      manifest: null,
      approvalEnvelope: null,
      approvalVerification: null,
      execute
    })).rejects.toThrow('crm_search_release_manifest_required')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects dirty trees, Node drift and target substitution before execution', async () => {
    const manifest = createArtifactManifest({
      implementationSha: sha,
      nodeVersion: '24.18.0',
      cleanTree: true,
      artifactDigest: digest('b'),
      lockfileDigest: digest('c'),
      buildCommandDigest: digest('d'),
      toolDigest: digest('e'),
      pagesConfigDigest: digest('f'),
      workerConfigDigest: digest('1'),
      bindingManifestDigest: digest('2')
    })
    expect(() => verifyArtifact(manifest, {
      ...manifest,
      cleanTree: false
    })).toThrow('crm_search_dirty_tree')
    expect(() => verifyArtifact(manifest, {
      ...manifest,
      nodeVersion: '24.18.1'
    })).toThrow('crm_search_node_version_mismatch')

    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const frozen = await frozenArtifactFixture()
    const approvalPayload = {
      approvalId: '40000000-0000-4000-8000-000000000001',
      approvalRevision: 0,
      type: 'production_deploy',
      environment: 'preview',
      originalTimestamp: '2026-08-11T00:00:00.000Z',
      expiresAt: '2026-08-12T00:00:00.000Z',
      implementationGitSha: sha,
      artifactManifestDigest: frozen.manifestEnvelope.payloadSha256,
      pagesBundleDigest: frozen.manifestEnvelope.payload.pages.digest,
      workerBundleDigest: frozen.manifestEnvelope.payload.worker.digest,
      bindingManifestDigest: frozen.pins.bindingManifestDigest,
      evidenceBundleHash: digest('d'),
      rateCardId: '50000000-0000-4000-8000-000000000001',
      expectedControlRevision: 11,
      organisationScopeId: '20000000-0000-4000-8000-000000000001',
      requestedByActorId: '10000000-0000-4000-8000-000000000001',
      approvedBy: '30000000-0000-4000-8000-000000000001',
      maximumCostUsdMicros: 25_000_000,
      clientIds: [],
      reason: 'Approve exact CRM search preview deployment'
    }
    const approvalBytes = canonicalBootstrapApprovalPayload(approvalPayload)
    const execute = vi.fn()
    await expect(runFrozenConsumerUpload({
      mode: 'preview',
      manifestEnvelope: frozen.manifestEnvelope,
      artifactVerification: frozen.artifactVerification,
      approvalEnvelope: {
        version: 'crm-search-bootstrap-approval-envelope-v1',
        keyVersion: 'release-2026-08',
        payload: approvalPayload,
        signature: sign(null, approvalBytes, privateKey).toString('base64url')
      },
      approvalVerification: {
        nowMs: Date.parse('2026-08-11T01:00:00.000Z'),
        keyring: {
          version: 'crm-search-release-verification-keyring-v1',
          activeKeyVersion: 'release-2026-08',
          keys: {
            'release-2026-08': {
              algorithm: 'Ed25519',
              publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
              notBefore: '2026-08-10T00:00:00.000Z',
              notAfter: '2026-08-20T00:00:00.000Z'
            }
          }
        }
      },
      resourceManifest: { worker: { name: 'agency-crm-search-consumer' } },
      configPath: path.join(frozen.artifactVerification.artifactRoot, 'config', 'worker.toml'),
      execute
    })).rejects.toThrow('crm_search_worker_target_mismatch')
    expect(execute).not.toHaveBeenCalled()

    const previewEnvelope = {
      version: 'crm-search-bootstrap-approval-envelope-v1',
      keyVersion: 'release-2026-08', payload: approvalPayload,
      signature: sign(null, approvalBytes, privateKey).toString('base64url')
    }
    const previewVerification = {
      nowMs: Date.parse('2026-08-11T01:00:00.000Z'),
      keyring: {
        version: 'crm-search-release-verification-keyring-v1',
        activeKeyVersion: 'release-2026-08',
        keys: {
          'release-2026-08': {
            algorithm: 'Ed25519',
            publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
            notBefore: '2026-08-10T00:00:00.000Z', notAfter: '2026-08-20T00:00:00.000Z'
          }
        }
      }
    }
    await expect(runFrozenPagesRelease({
      mode: 'preview', manifestEnvelope: frozen.manifestEnvelope,
      artifactVerification: frozen.artifactVerification,
      approvalEnvelope: previewEnvelope, approvalVerification: previewVerification,
      execute
    })).rejects.toThrow('crm_search_release_approval_readback_required')
    await expect(runFrozenConsumerUpload({
      mode: 'preview', manifestEnvelope: frozen.manifestEnvelope,
      artifactVerification: frozen.artifactVerification,
      approvalEnvelope: previewEnvelope, approvalVerification: previewVerification,
      resourceManifest: { worker: { name: 'agency-crm-search-consumer-preview' } },
      configPath: path.join(frozen.artifactVerification.artifactRoot, 'config', 'worker.toml'),
      execute
    })).rejects.toThrow('crm_search_release_approval_readback_required')
    expect(execute).not.toHaveBeenCalled()
  })

  it('requires the complete production approval and a fresh unrevoked revision readback immediately before spawn', async () => {
    const frozen = await frozenArtifactFixture()
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const approvalPayload = {
      approvalId: '40000000-0000-4000-8000-000000000001',
      approvalRevision: 0,
      type: 'production_deploy',
      environment: 'production',
      originalTimestamp: '2026-08-11T00:00:00.000Z',
      expiresAt: '2026-08-12T00:00:00.000Z',
      implementationGitSha: sha,
      artifactManifestDigest: frozen.manifestEnvelope.payloadSha256,
      pagesBundleDigest: frozen.manifestEnvelope.payload.pages.digest,
      workerBundleDigest: frozen.manifestEnvelope.payload.worker.digest,
      bindingManifestDigest: frozen.pins.bindingManifestDigest,
      evidenceBundleHash: digest('e'),
      rateCardId: '50000000-0000-4000-8000-000000000001',
      expectedControlRevision: 11,
      organisationScopeId: '20000000-0000-4000-8000-000000000001',
      requestedByActorId: '10000000-0000-4000-8000-000000000001',
      approvedBy: '30000000-0000-4000-8000-000000000001',
      maximumCostUsdMicros: 25_000_000,
      clientIds: [],
      reason: 'Approve the exact frozen production deployment'
    }
    const evidenceKeys = generateKeyPairSync('ed25519')
    const evidenceBundle = createEvidenceBundle({
      issuedAt: '2026-08-11T00:59:59.000Z',
      environment: 'production',
      implementationGitSha: sha,
      artifact: {
        manifestDigest: approvalPayload.artifactManifestDigest,
        pagesBundleDigest: approvalPayload.pagesBundleDigest,
        workerBundleDigest: approvalPayload.workerBundleDigest,
        bindingManifestDigest: approvalPayload.bindingManifestDigest
      },
      resource: { manifestDigest: digest('5'), readbackDigest: digest('6') },
      approval: {
        id: approvalPayload.approvalId, revision: approvalPayload.approvalRevision,
        type: approvalPayload.type, expiresAt: approvalPayload.expiresAt,
        revocationCheckedAt: '2026-08-11T00:59:59.000Z'
      },
      neon: { attestationSha256: digest('7') },
      sealedHoldout: {
        objectKey: 'crm-search/evaluation/holdouts/holdout-v1.json',
        objectSha256: digest('8'), keyVersion: 'holdout-2026-08',
        envelopeVersion: 'crm-search-sealed-holdout-v1', judgementSha256: digest('9'),
        productionReady: true
      },
      cleanup: {
        ...cleanupEvidence()
      }
    }, { keyVersion: 'evidence-2026-08', privateKey: evidenceKeys.privateKey })
    approvalPayload.evidenceBundleHash = evidenceBundle.evidenceBundleHash
    const evidenceKeyring = {
      version: 'crm-search-evidence-verification-keyring-v1',
      activeKeyVersion: 'evidence-2026-08',
      keys: {
        'evidence-2026-08': evidenceKeys.publicKey.export({
          type: 'spki', format: 'der'
        }).toString('base64url')
      }
    }
    const envelope = {
      version: 'crm-search-bootstrap-approval-envelope-v1',
      keyVersion: 'release-2026-08',
      payload: approvalPayload,
      signature: sign(null, canonicalBootstrapApprovalPayload(approvalPayload), privateKey).toString('base64url')
    }
    const verification = {
      nowMs: Date.parse('2026-08-11T01:00:00.000Z'),
      keyring: {
        version: 'crm-search-release-verification-keyring-v1',
        activeKeyVersion: 'release-2026-08',
        keys: {
          'release-2026-08': {
            algorithm: 'Ed25519',
            publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
            notBefore: '2026-08-10T00:00:00.000Z',
            notAfter: '2026-08-20T00:00:00.000Z'
          }
        }
      }
    }
    const order: string[] = []
    const readCurrentApproval = vi.fn(async (context) => {
      order.push(`readback:${context.phase}`)
      return {
        ...approvalPayload, status: 'active', revokedAt: null,
        readbackAt: '2026-08-11T01:00:00.000Z'
      }
    })
    const execute = vi.fn(async (command) => {
      if (command.args[0] === 'pages') {
        order.push('spawn:pages')
        return { deploymentId: 'pages-deployment-123' }
      }
      if (command.args[1] === 'upload') {
        order.push('spawn:worker-upload')
        return { versionId: 'worker-version-123' }
      }
      if (command.args[1] === 'deploy') {
        order.push('spawn:worker-activate')
        return { versionId: 'worker-version-123', deploymentId: 'worker-deployment-456' }
      }
      throw new Error('unexpected release command')
    })
    const recordDeploymentPhase = vi.fn(async (event) => {
      order.push(`record:${event.phase}:${event.status}`)
      return { journalId: `${event.phase}-${event.status}` }
    })
    const finalizeDeploymentApproval = vi.fn(async (event) => {
      order.push('finalize')
      return { consumptionId: 'consumption-1', ...event }
    })
    const pagesResult = await runFrozenPagesRelease({
      mode: 'production', manifestEnvelope: frozen.manifestEnvelope,
      artifactVerification: frozen.artifactVerification,
      approvalEnvelope: envelope, approvalVerification: verification,
      evidenceBundle, evidenceKeyring,
      currentTime: () => verification.nowMs,
      readCurrentApproval, recordDeploymentPhase, execute
    })
    expect(order).toEqual([
      'readback:before-pages-deploy', 'record:pages:started',
      'spawn:pages', 'record:pages:succeeded'
    ])
    expect(pagesResult).toMatchObject({ deploymentId: 'pages-deployment-123' })
    expect(finalizeDeploymentApproval).not.toHaveBeenCalled()
    order.length = 0
    execute.mockClear()
    readCurrentApproval.mockClear()
    recordDeploymentPhase.mockClear()

    const result = await runFrozenConsumerUpload({
      mode: 'production', manifestEnvelope: frozen.manifestEnvelope,
      artifactVerification: frozen.artifactVerification,
      approvalEnvelope: envelope, approvalVerification: verification,
      evidenceBundle, evidenceKeyring,
      currentTime: () => verification.nowMs,
      readCurrentApproval,
      recordDeploymentPhase,
      finalizeDeploymentApproval,
      resourceManifest: { worker: { name: 'agency-crm-search-consumer' } },
      configPath: path.join(frozen.artifactVerification.artifactRoot, 'config', 'worker.toml'),
      execute
    })
    expect(order).toEqual([
      'readback:before-worker-upload', 'record:worker_upload:started',
      'spawn:worker-upload', 'record:worker_upload:succeeded',
      'readback:before-worker-activate', 'record:worker_activate:started',
      'spawn:worker-activate', 'record:worker_activate:succeeded', 'finalize'
    ])
    expect(execute).toHaveBeenNthCalledWith(1, expect.objectContaining({ args: [
      'versions', 'upload', path.join(frozen.artifactVerification.artifactRoot, 'worker', 'worker.mjs'), '--no-bundle',
      '--config', path.join(frozen.artifactVerification.artifactRoot, 'config', 'worker.toml'),
      '--cwd', frozen.artifactVerification.artifactRoot
    ] }))
    expect(execute).toHaveBeenNthCalledWith(2, expect.objectContaining({ args: [
      'versions', 'deploy', 'worker-version-123@100%', '--yes',
      '--config', path.join(frozen.artifactVerification.artifactRoot, 'config', 'worker.toml'),
      '--cwd', frozen.artifactVerification.artifactRoot
    ] }))
    expect(result).toMatchObject({
      versionId: 'worker-version-123', deploymentId: 'worker-deployment-456'
    })
    expect(finalizeDeploymentApproval).toHaveBeenCalledWith(expect.objectContaining({
      approvalId: approvalPayload.approvalId,
      workerVersionId: 'worker-version-123', workerDeploymentId: 'worker-deployment-456'
    }))

    order.length = 0
    execute.mockClear()
    recordDeploymentPhase.mockClear()
    finalizeDeploymentApproval.mockClear()
    const revokedBeforeActivation = vi.fn()
      .mockResolvedValueOnce({
        ...approvalPayload, status: 'active', revokedAt: null,
        readbackAt: '2026-08-11T01:00:00.000Z'
      })
      .mockResolvedValueOnce({
        ...approvalPayload, status: 'revoked', revokedAt: '2026-08-11T01:00:00.000Z',
        readbackAt: '2026-08-11T01:00:00.000Z'
      })
    await expect(runFrozenConsumerUpload({
      mode: 'production', manifestEnvelope: frozen.manifestEnvelope,
      artifactVerification: frozen.artifactVerification,
      approvalEnvelope: envelope, approvalVerification: verification,
      evidenceBundle, evidenceKeyring,
      currentTime: () => verification.nowMs,
      readCurrentApproval: revokedBeforeActivation,
      recordDeploymentPhase,
      finalizeDeploymentApproval,
      resourceManifest: { worker: { name: 'agency-crm-search-consumer' } },
      configPath: path.join(frozen.artifactVerification.artifactRoot, 'config', 'worker.toml'),
      execute
    })).rejects.toThrow('crm_search_release_approval_revoked')
    expect(execute).toHaveBeenCalledTimes(1)
    expect(recordDeploymentPhase).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'worker_upload', status: 'succeeded', versionId: 'worker-version-123'
    }))
    expect(finalizeDeploymentApproval).not.toHaveBeenCalled()

    execute.mockClear()
    await expect(runFrozenConsumerUpload({
      mode: 'production', manifestEnvelope: frozen.manifestEnvelope,
      artifactVerification: frozen.artifactVerification,
      approvalEnvelope: envelope, approvalVerification: verification,
      evidenceBundle, evidenceKeyring,
      currentTime: () => verification.nowMs,
      readCurrentApproval: async () => ({
        ...approvalPayload, status: 'revoked', revokedAt: '2026-08-11T00:30:00.000Z',
        readbackAt: '2026-08-11T01:00:00.000Z'
      }),
      resourceManifest: { worker: { name: 'agency-crm-search-consumer' } },
      configPath: path.join(frozen.artifactVerification.artifactRoot, 'config', 'worker.toml'),
      recordDeploymentPhase, finalizeDeploymentApproval, execute
    })).rejects.toThrow('crm_search_release_approval_revoked')
    expect(execute).not.toHaveBeenCalled()
  })

  it('emits only a bounded privacy-safe signed release evidence contract', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const evidence = {
      issuedAt: '2026-08-11T01:00:00.000Z',
      environment: 'preview',
      implementationGitSha: sha,
      artifact: {
        manifestDigest: digest('1'), pagesBundleDigest: digest('2'),
        workerBundleDigest: digest('3'), bindingManifestDigest: digest('4')
      },
      resource: { manifestDigest: digest('5'), readbackDigest: digest('6') },
      approval: {
        id: '40000000-0000-4000-8000-000000000001', revision: 0,
        type: 'production_deploy', expiresAt: '2026-08-12T00:00:00.000Z',
        revocationCheckedAt: '2026-08-11T00:59:59.000Z'
      },
      neon: { attestationSha256: digest('7') },
      sealedHoldout: {
        objectKey: 'crm-search/evaluation/holdouts/holdout-v1.json',
        objectSha256: digest('8'), keyVersion: 'holdout-2026-08',
        envelopeVersion: 'crm-search-sealed-holdout-v1', judgementSha256: digest('9'),
        productionReady: false
      },
      cleanup: cleanupEvidence()
    }
    const bundle = createEvidenceBundle(evidence, { keyVersion: 'evidence-2026-08', privateKey })
    expect(verifyEvidenceBundle(bundle, {
      version: 'crm-search-evidence-verification-keyring-v1',
      activeKeyVersion: 'evidence-2026-08',
      keys: { 'evidence-2026-08': publicKey.export({ type: 'spki', format: 'der' }).toString('base64url') }
    })).toEqual(evidence)
    expect(() => createEvidenceBundle({ ...evidence, sourceRows: ['alice@example.com'] }, {
      keyVersion: 'evidence-2026-08', privateKey
    })).toThrow('crm_search_evidence_schema_invalid')
    expect(() => createEvidenceBundle({
      ...evidence,
      cleanup: { ...evidence.cleanup, query: 'select * from crm_people' }
    }, { keyVersion: 'evidence-2026-08', privateKey })).toThrow('crm_search_evidence_privacy_violation')
    expect(() => createEvidenceBundle({
      ...evidence,
      cleanup: {
        ...evidence.cleanup,
        journal: [{ ...evidence.cleanup.journal[0], finalReadbackDigest: digest('c') }]
      }
    }, { keyVersion: 'evidence-2026-08', privateKey })).toThrow('crm_search_cleanup_journal_digest_mismatch')
  })
})
