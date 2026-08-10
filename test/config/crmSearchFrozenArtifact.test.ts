import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  createArtifactManifest,
  runArtifactBuild,
  verifyArtifact
} from '../../scripts/crm-search/build-artifact.mjs'
import {
  canonicalBootstrapApprovalPayload,
  verifyBootstrapResourceApproval
} from '../../scripts/crm-search/bootstrap-resource-approval.mjs'
import { runFrozenPagesRelease } from '../../scripts/crm-search/deploy-pages-artifact.mjs'
import { runFrozenConsumerUpload } from '../../scripts/crm-search/deploy-consumer-artifact.mjs'

const sha = 'a'.repeat(40)
const digest = (value: string) => `${value.repeat(64)}`

describe('CRM search frozen release artifact', () => {
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
    const approvalPayload = {
      type: 'production_deploy',
      environment: 'preview',
      originalTimestamp: '2026-08-11T00:00:00.000Z',
      expiresAt: '2026-08-12T00:00:00.000Z',
      implementationGitSha: sha,
      artifactManifestDigest: digest('b'),
      bindingManifestDigest: digest('2'),
      evidenceBundleHash: digest('d'),
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
      manifest,
      actual: manifest,
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
      configPath: 'workers/crm-search-consumer/wrangler.toml',
      execute
    })).rejects.toThrow('crm_search_worker_target_mismatch')
    expect(execute).not.toHaveBeenCalled()
  })
})
