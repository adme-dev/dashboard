import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { canonicalBootstrapApprovalPayload } from '../../scripts/crm-search/bootstrap-resource-approval.mjs'

import {
  buildNeonLifecyclePlan,
  createNeonTargetAttestation,
  runNeonLifecycle
} from '../../scripts/crm-search/neon-lifecycle.mjs'

const sha = 'a'.repeat(40)
const digest = (value: string) => value.repeat(64)

function migrationApprovalFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const payload = {
    approvalId: '40000000-0000-4000-8000-000000000001',
    approvalRevision: 0,
    type: 'production_migration',
    environment: 'preview',
    originalTimestamp: '2026-08-11T00:00:00.000Z',
    expiresAt: '2026-08-12T00:00:00.000Z',
    implementationGitSha: sha,
    artifactManifestDigest: digest('1'),
    bindingManifestDigest: digest('2'),
    evidenceBundleHash: digest('3'),
    organisationScopeId: '20000000-0000-4000-8000-000000000001',
    requestedByActorId: '10000000-0000-4000-8000-000000000001',
    approvedBy: '30000000-0000-4000-8000-000000000001',
    maximumCostUsdMicros: 25_000_000,
    clientIds: [],
    reason: 'Approve exact isolated CRM search migration target'
  } as const
  return {
    payload,
    envelope: {
      version: 'crm-search-bootstrap-approval-envelope-v1',
      keyVersion: 'migration-2026-08',
      payload,
      signature: sign(null, canonicalBootstrapApprovalPayload(payload), privateKey).toString('base64url')
    },
    verification: {
      nowMs: Date.parse('2026-08-11T00:01:00.000Z'),
      keyring: {
        version: 'crm-search-release-verification-keyring-v1',
        activeKeyVersion: 'migration-2026-08',
        keys: {
          'migration-2026-08': {
            algorithm: 'Ed25519',
            publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
            notBefore: '2026-08-10T00:00:00.000Z',
            notAfter: '2026-08-20T00:00:00.000Z'
          }
        }
      }
    }
  }
}

function activeReadback(payload: ReturnType<typeof migrationApprovalFixture>['payload']) {
  return {
    ...payload,
    status: 'active', revokedAt: null,
    readbackAt: '2026-08-11T00:00:30.000Z',
    readbackSource: 'direct_neon'
  }
}

describe('CRM search guarded Neon lifecycle', () => {
  it('pins an exact schema-only TTL branch and operation polling plan', () => {
    const plan = buildNeonLifecyclePlan({
      projectId: 'project-preview-1',
      expectedProjectId: 'project-preview-1',
      parentBranchId: 'br-preview-parent',
      implementationSha: 'a'.repeat(40),
      nowMs: Date.parse('2026-08-11T00:00:00.000Z')
    })
    expect(plan.create.branch).toMatchObject({
      name: `crm-search-e2e-${'a'.repeat(12)}`,
      parent_id: 'br-preview-parent',
      init_source: 'schema-only',
      expires_at: '2026-08-11T06:00:00.000Z'
    })
    expect(plan.pollOperations).toBe(true)
    expect(plan.assertEmptyTables).toEqual(expect.arrayContaining([
      'crm_people', 'crm_companies', 'crm_opportunities'
    ]))
    expect(plan.migrations).toEqual([350, 351, 352])
  })

  it('does not call an executor in dry-run mode', async () => {
    const result = await runNeonLifecycle({
      dryRun: true,
      plan: buildNeonLifecyclePlan({
        projectId: 'project-preview-1',
        expectedProjectId: 'project-preview-1',
        parentBranchId: 'br-preview-parent',
        implementationSha: 'a'.repeat(40),
        nowMs: Date.parse('2026-08-11T00:00:00.000Z')
      })
    })
    expect(result).toMatchObject({
      dryRun: true, mutationCount: 0,
      requiredProofs: expect.arrayContaining([
        'signed-production-migration-approval', 'fresh-direct-neon-readback-before-create',
        'fresh-direct-neon-readback-before-migrate'
      ])
    })
  })

  it('rejects a caller-built plain migration authority before any adapter call', async () => {
    const execute = vi.fn()
    await expect(runNeonLifecycle({
      dryRun: false,
      mutationAuthorization: {
        version: 'crm-search-neon-mutation-authorization-v1',
        purpose: 'crm-search-task18-neon-lifecycle', environment: 'preview',
        approvalId: '40000000-0000-4000-8000-000000000001', approvalRevision: 7,
        approvalType: 'production_migration', projectId: 'project-preview-1',
        expiresAt: '2026-08-12T00:00:00.000Z'
      },
      plan: buildNeonLifecyclePlan({
        projectId: 'project-preview-1', expectedProjectId: 'project-preview-1',
        parentBranchId: 'br-preview-parent', implementationSha: sha,
        nowMs: Date.parse('2026-08-11T00:00:00.000Z')
      }),
      execute
    })).rejects.toThrow('crm_search_neon_migration_approval_required')
    expect(execute).not.toHaveBeenCalled()
  })

  it('models one outer finally and always requests exact branch cleanup after failure', async () => {
    const approval = migrationApprovalFixture()
    const calls: string[] = []
    const execute = vi.fn(async (step: { action: string }) => {
      calls.push(step.action)
      if (step.action === 'assert-empty') throw new Error('not_empty')
      if (step.action === 'create') return {
        branch: {
          id: 'br-created', project_id: 'project-preview-1', parent_id: 'br-preview-parent',
          name: `crm-search-e2e-${'a'.repeat(12)}`,
          created_at: '2026-08-11T00:00:00.000Z', expires_at: '2026-08-11T06:00:00.000Z'
        },
        endpoints: [{
          id: 'ep-crm-search-e2e-failure', branch_id: 'br-created',
          host: 'ep-crm-search-e2e-failure.ap-southeast-2.aws.neon.tech'
        }],
        operations: [{ id: 'op-create' }]
      }
      if (step.action === 'delete') return { operations: [{ id: 'op-delete' }] }
      return { ok: true }
    })
    await expect(runNeonLifecycle({
      dryRun: false,
      approvalEnvelope: approval.envelope,
      approvalVerification: approval.verification,
      readCurrentApproval: vi.fn().mockResolvedValue(activeReadback(approval.payload)),
      currentTime: () => Date.parse('2026-08-11T00:01:00.000Z'),
      plan: buildNeonLifecyclePlan({
        projectId: 'project-preview-1',
        expectedProjectId: 'project-preview-1',
        parentBranchId: 'br-preview-parent',
        implementationSha: 'a'.repeat(40),
        nowMs: Date.parse('2026-08-11T00:00:00.000Z')
      }),
      trustedSharedEndpointDenyset: ['ep-production-shared-a1b2c3d4'],
      execute
    })).rejects.toThrow('not_empty')
    expect(calls).toEqual(['create', 'poll', 'assert-empty', 'delete', 'poll'])
  })

  it('creates a Task5-compatible signed direct-endpoint attestation after exact migrations and always deletes the branch', async () => {
    const approval = migrationApprovalFixture()
    const calls: string[] = []
    const { privateKey } = generateKeyPairSync('ed25519')
    const plan = buildNeonLifecyclePlan({
      projectId: 'prj-crm-search-e2e', expectedProjectId: 'prj-crm-search-e2e',
      parentBranchId: 'br-source-isolated', implementationSha: 'a'.repeat(40),
      nowMs: Date.parse('2026-08-11T00:00:00.000Z')
    })
    const execute = vi.fn(async (step: { action: string }) => {
      calls.push(step.action)
      if (step.action === 'create') return {
        branch: {
          id: 'br-crm-search-e2e', project_id: plan.projectId,
          parent_id: 'br-source-isolated', name: `crm-search-e2e-${'a'.repeat(12)}`,
          created_at: '2026-08-11T00:00:00.000Z', expires_at: '2026-08-11T06:00:00.000Z'
        },
        endpoints: [{
          id: 'ep-crm-search-e2e-a1b2c3d4', branch_id: 'br-crm-search-e2e',
          host: 'ep-crm-search-e2e-a1b2c3d4.ap-southeast-2.aws.neon.tech'
        }],
        operations: [{ id: 'op-create' }]
      }
      if (step.action === 'assert-empty') return { emptySourceProof: true }
      if (step.action === 'delete') return { operations: [{ id: 'op-delete' }] }
      return { ok: true }
    })
    const result = await runNeonLifecycle({
      dryRun: false,
      approvalEnvelope: approval.envelope,
      approvalVerification: approval.verification,
      readCurrentApproval: vi.fn().mockResolvedValue(activeReadback(approval.payload)),
      currentTime: () => Date.parse('2026-08-11T00:01:00.000Z'),
      plan,
      trustedSharedEndpointDenyset: ['ep-production-shared-a1b2c3d4'],
      signing: { signerKeyId: 'crm-search-task18-test-key', privateKey },
      execute
    })
    expect(result.attestation).toMatchObject({
      version: 'crm-search-neon-target-attestation-v1',
      producer: 'scripts/crm-search/neon-lifecycle.mjs',
      sourceGitSha: 'a'.repeat(40), schemaOnly: true,
      neonApi: { endpoint: { id: 'ep-crm-search-e2e-a1b2c3d4' } },
      signatureAlgorithm: 'ed25519',
      governanceApproval: {
        id: approval.payload.approvalId, revision: approval.payload.approvalRevision,
        artifactManifestDigest: approval.payload.artifactManifestDigest,
        bindingManifestDigest: approval.payload.bindingManifestDigest,
        evidenceBundleHash: approval.payload.evidenceBundleHash
      },
      apiResponseSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      attestationSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
    expect(Object.keys(result.attestation.migrationDigests)).toEqual(result.attestation.migrationPaths)
    expect(calls).toEqual(['create', 'poll', 'assert-empty', 'migrate', 'delete', 'poll'])
    expect(execute.mock.calls.find(([step]) => step.action === 'create')?.[0]).toMatchObject({
      governanceApproval: expect.objectContaining({ id: approval.payload.approvalId })
    })
    expect(() => createNeonTargetAttestation({
      ...result.attestation,
      migrationDigests: {
        ...result.attestation.migrationDigests,
        [result.attestation.migrationPaths[0]]: 'f'.repeat(64)
      },
      trustedSharedEndpointDenyset: ['ep-production-shared-a1b2c3d4'],
      signing: { signerKeyId: 'crm-search-task18-test-key', privateKey }
    })).toThrow('crm_search_neon_attestation_invalid')
    expect(() => createNeonTargetAttestation({
      ...result.attestation,
      endpoint: { ...result.attestation.neonApi.endpoint, host: 'ep-crm-search-e2e-a1b2c3d4-pooler.ap-southeast-2.aws.neon.tech' }
    })).toThrow('crm_search_neon_endpoint_invalid')
    expect(() => createNeonTargetAttestation({
      ...result.attestation,
      governanceApproval: { ...result.attestation.governanceApproval, id: 'caller-built' },
      trustedSharedEndpointDenyset: ['ep-production-shared-a1b2c3d4'],
      signing: { signerKeyId: 'crm-search-task18-test-key', privateKey }
    })).toThrow('crm_search_neon_attestation_invalid')
  })

  it('performs a fresh direct-Neon revocation readback immediately before create and migrate', async () => {
    const approval = migrationApprovalFixture()
    const execute = vi.fn(async (step: { action: string }) => {
      if (step.action === 'create') return {
        branch: {
          id: 'br-created', project_id: 'project-preview-1', parent_id: 'br-preview-parent',
          name: `crm-search-e2e-${sha.slice(0, 12)}`,
          created_at: '2026-08-11T00:00:00.000Z', expires_at: '2026-08-11T06:00:00.000Z'
        },
        endpoints: [{
          id: 'ep-crm-search-e2e-test', branch_id: 'br-created',
          host: 'ep-crm-search-e2e-test.ap-southeast-2.aws.neon.tech'
        }],
        operations: [{ id: 'op-create' }]
      }
      if (step.action === 'assert-empty') return { emptySourceProof: true }
      if (step.action === 'delete') return { operations: [{ id: 'op-delete' }] }
      return { ok: true }
    })
    const readCurrentApproval = vi.fn()
      .mockResolvedValueOnce(activeReadback(approval.payload))
      .mockResolvedValueOnce({
        ...activeReadback(approval.payload), status: 'revoked',
        revokedAt: '2026-08-11T00:00:45.000Z'
      })
    await expect(runNeonLifecycle({
      dryRun: false,
      approvalEnvelope: approval.envelope,
      approvalVerification: approval.verification,
      readCurrentApproval,
      currentTime: () => Date.parse('2026-08-11T00:01:00.000Z'),
      plan: buildNeonLifecyclePlan({
        projectId: 'project-preview-1', expectedProjectId: 'project-preview-1',
        parentBranchId: 'br-preview-parent', implementationSha: sha,
        nowMs: Date.parse('2026-08-11T00:00:00.000Z')
      }),
      trustedSharedEndpointDenyset: ['ep-production-shared-a1b2c3d4'],
      signing: { signerKeyId: 'crm-search-task18-test-key', privateKey: generateKeyPairSync('ed25519').privateKey },
      execute
    })).rejects.toThrow('crm_search_release_approval_revoked')
    expect(readCurrentApproval).toHaveBeenNthCalledWith(1, expect.objectContaining({ phase: 'before-create' }))
    expect(readCurrentApproval).toHaveBeenNthCalledWith(2, expect.objectContaining({ phase: 'before-migrate' }))
    expect(execute.mock.calls.map(([step]) => step.action)).toEqual([
      'create', 'poll', 'assert-empty', 'delete', 'poll'
    ])
  })
})
