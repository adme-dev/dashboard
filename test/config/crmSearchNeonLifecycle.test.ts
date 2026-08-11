import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { canonicalBootstrapApprovalPayload } from '../../scripts/crm-search/bootstrap-resource-approval.mjs'

import {
  buildNeonLifecyclePlan,
  createNeonTargetAttestation,
  runNeonLifecycle
} from '../../scripts/crm-search/neon-lifecycle.mjs'
import { canonicalPreviewNeonBootstrapPayload } from '../../scripts/crm-search/preview-neon-bootstrap-authorization.mjs'

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

function previewBootstrapFixture(plan: ReturnType<typeof buildNeonLifecyclePlan>) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const payload = {
    version: 'crm-search-preview-neon-bootstrap-authorization-v1',
    approvalId: '50000000-0000-4000-8000-000000000005',
    environment: 'preview',
    implementationSha: plan.implementationSha,
    neonProjectId: plan.projectId,
    neonParentBranchId: plan.create.branch.parent_id,
    organisationScopeId: '20000000-0000-4000-8000-000000000002',
    branchName: plan.create.branch.name,
    branchExpiresAt: plan.create.branch.expires_at,
    migrationDigests: plan.previewMigrationDigests,
    pagesPreviewDigest: 'b'.repeat(64),
    resourceReadbackDigest: 'c'.repeat(64),
    maximumCostUsdMicros: 0,
    cleanupRequired: true,
    reason: 'User-approved isolated preview migration proof with mandatory branch cleanup',
    issuedAt: '2026-08-11T00:00:00.000Z',
    expiresAt: '2026-08-11T00:20:00.000Z'
  }
  const envelope = {
    version: 'crm-search-preview-neon-bootstrap-envelope-v1',
    keyId: 'preview-neon-ephemeral-v1',
    payload,
    signature: sign(
      null,
      Buffer.from(canonicalPreviewNeonBootstrapPayload(payload), 'utf8'),
      privateKey
    ).toString('base64url')
  }
  return {
    envelope,
    verification: {
      keyring: {
        version: 'crm-search-preview-neon-bootstrap-keyring-v1',
        activeKeyId: envelope.keyId,
        keys: [{
          keyId: envelope.keyId,
          publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString()
        }]
      },
      expected: {
        implementationSha: payload.implementationSha,
        neonProjectId: payload.neonProjectId,
        neonParentBranchId: payload.neonParentBranchId,
        organisationScopeId: payload.organisationScopeId,
        branchName: payload.branchName,
        branchExpiresAt: payload.branchExpiresAt,
        migrationDigests: payload.migrationDigests,
        pagesPreviewDigest: payload.pagesPreviewDigest,
        resourceReadbackDigest: payload.resourceReadbackDigest
      }
    },
    payload
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
      init_source: 'parent-schema',
      expires_at: '2026-08-11T06:00:00.000Z'
    })
    expect(plan.pollOperations).toBe(true)
    expect(plan.assertEmptyTables).toEqual(expect.arrayContaining([
      'crm_people', 'crm_companies', 'crm_opportunities'
    ]))
    expect(plan.prerequisiteMigrationPaths).toEqual([
      'server/database/migrations/134-crm-core.sql',
      'server/database/migrations/135-crm-opportunities.sql'
    ])
    expect(plan.migrations).toEqual([350, 351, 352])
    expect(plan.previewMigrations).toEqual([134, 135, 350, 351, 352])
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
    const execute = vi.fn(async (step: { action: string, phase?: string }) => {
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
      if (step.action === 'read-branch') return step.phase === 'post-delete'
        ? { branch: null, readAt: '2026-08-11T00:02:00.000Z' }
        : {
            branch: {
              id: 'br-created', project_id: 'project-preview-1', parent_id: 'br-preview-parent',
              name: `crm-search-e2e-${'a'.repeat(12)}`, init_source: 'parent-schema',
              created_at: '2026-08-11T00:00:00.000Z', expires_at: '2026-08-11T06:00:00.000Z'
            },
            readAt: '2026-08-11T00:00:30.000Z'
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
    expect(calls).toEqual([
      'create', 'poll', 'read-branch', 'assert-empty', 'delete', 'poll', 'read-branch'
    ])
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
    const execute = vi.fn(async (step: { action: string, phase?: string }) => {
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
      if (step.action === 'read-branch') return step.phase === 'post-delete'
        ? { branch: null, readAt: '2026-08-11T00:02:00.000Z' }
        : {
            branch: {
              id: 'br-crm-search-e2e', project_id: plan.projectId,
              parent_id: 'br-source-isolated', name: `crm-search-e2e-${'a'.repeat(12)}`,
              init_source: 'parent-schema', created_at: '2026-08-11T00:00:00.000Z',
              expires_at: '2026-08-11T06:00:00.000Z'
            },
            readAt: '2026-08-11T00:00:30.000Z'
          }
      if (step.action === 'assert-empty') return {
        organisationScopeId: approval.payload.organisationScopeId,
        checkedAt: '2026-08-11T00:00:40.000Z',
        tables: { crm_people: 0, crm_companies: 0, crm_opportunities: 0 }
      }
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
      sourceTableProof: {
        organisationScopeId: approval.payload.organisationScopeId,
        checkedAt: '2026-08-11T00:00:40.000Z',
        tables: { crm_people: 0, crm_companies: 0, crm_opportunities: 0 }
      },
      apiResponseSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      attestationSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
    expect(Object.keys(result.attestation.migrationDigests)).toEqual(result.attestation.migrationPaths)
    expect(calls).toEqual([
      'create', 'poll', 'read-branch', 'assert-empty', 'migrate',
      'delete', 'poll', 'read-branch'
    ])
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

  it('uses short-lived preview-only bootstrap authority when production approval tables do not exist', async () => {
    const plan = buildNeonLifecyclePlan({
      projectId: 'square-tooth-23821574', expectedProjectId: 'square-tooth-23821574',
      parentBranchId: 'br-small-hall-a4qtwjgo', implementationSha: sha,
      nowMs: Date.parse('2026-08-11T00:00:00.000Z')
    })
    const bootstrap = previewBootstrapFixture(plan)
    const { privateKey } = generateKeyPairSync('ed25519')
    const readCurrentPreviewBootstrap = vi.fn().mockResolvedValue({
      source: 'local_ephemeral_approval', status: 'active', revokedAt: null,
      readbackAt: '2026-08-11T00:01:00.000Z', envelope: bootstrap.envelope
    })
    const execute = vi.fn(async (step: { action: string, phase?: string }) => {
      if (step.action === 'create') return {
        branch: {
          id: 'br-crm-search-preview-1234', project_id: plan.projectId,
          parent_id: plan.create.branch.parent_id, name: plan.create.branch.name,
          created_at: '2026-08-11T00:00:00.000Z', expires_at: plan.create.branch.expires_at
        },
        endpoints: [{
          id: 'ep-crm-search-preview-1234', branch_id: 'br-crm-search-preview-1234',
          host: 'ep-crm-search-preview-1234.ap-southeast-2.aws.neon.tech'
        }],
        operations: [{ id: 'op-create' }]
      }
      if (step.action === 'read-branch') return step.phase === 'post-delete'
        ? { branch: null, readAt: '2026-08-11T00:03:00.000Z' }
        : {
            branch: {
              id: 'br-crm-search-preview-1234', project_id: plan.projectId,
              name: plan.create.branch.name,
              init_source: 'parent-schema', created_at: '2026-08-11T00:00:00.000Z',
              expires_at: new Date(Date.parse(plan.create.branch.expires_at) - 500).toISOString()
            },
            readAt: '2026-08-11T00:01:00.000Z'
          }
      if (step.action === 'assert-empty') return {
        organisationScopeId: bootstrap.payload.organisationScopeId,
        checkedAt: '2026-08-11T00:01:10.000Z',
        tables: { crm_people: 0, crm_companies: 0, crm_opportunities: 0 }
      }
      if (step.action === 'delete') return { operations: [{ id: 'op-delete' }] }
      return { ok: true }
    })

    const result = await runNeonLifecycle({
      dryRun: false,
      executeFlag: 'EXECUTE PREVIEW NEON BOOTSTRAP',
      previewBootstrapEnvelope: bootstrap.envelope,
      previewBootstrapVerification: bootstrap.verification,
      readCurrentPreviewBootstrap,
      currentTime: () => Date.parse('2026-08-11T00:01:00.000Z'),
      plan,
      trustedSharedEndpointDenyset: ['ep-production-shared-a1b2c3d4'],
      signing: { signerKeyId: 'crm-search-preview-attestation-v1', privateKey },
      execute
    })

    expect(readCurrentPreviewBootstrap).toHaveBeenNthCalledWith(1, expect.objectContaining({
      phase: 'before-create', approvalId: bootstrap.payload.approvalId
    }))
    expect(readCurrentPreviewBootstrap).toHaveBeenNthCalledWith(2, expect.objectContaining({
      phase: 'before-prerequisites', approvalId: bootstrap.payload.approvalId
    }))
    expect(readCurrentPreviewBootstrap).toHaveBeenNthCalledWith(3, expect.objectContaining({
      phase: 'before-migrate', approvalId: bootstrap.payload.approvalId
    }))
    expect(execute.mock.calls.map(([step]) => step.action)).toEqual([
      'create', 'poll', 'read-branch', 'migrate-prerequisites', 'assert-empty',
      'migrate', 'delete', 'poll', 'read-branch'
    ])
    expect(result.attestation.governanceApproval).toEqual({
      id: bootstrap.payload.approvalId,
      type: 'preview_migration',
      migrationSetDigest: createHash('sha256')
        .update(canonicalPreviewNeonBootstrapPayload(plan.previewMigrationDigests), 'utf8').digest('hex'),
      pagesPreviewDigest: bootstrap.payload.pagesPreviewDigest,
      resourceReadbackDigest: bootstrap.payload.resourceReadbackDigest,
      organisationScopeId: bootstrap.payload.organisationScopeId
    })
    expect(result.attestation.neonApi.branch.initSource).toBe('parent-schema')
    expect(result.attestation.neonApi.branch).toMatchObject({
      parentId: plan.create.branch.parent_id,
      providerParentId: null,
      parentBindingSource: 'signed_create_request'
    })
    expect(result.cleanup).toMatchObject({
      branchId: 'br-crm-search-preview-1234', absent: true
    })
  })

  it('rejects a data-bearing provider readback even when the caller requested schema-only', async () => {
    const approval = migrationApprovalFixture()
    const { privateKey } = generateKeyPairSync('ed25519')
    const execute = vi.fn(async (step: { action: string, phase?: string }) => {
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
      if (step.action === 'read-branch') return step.phase === 'post-delete'
        ? { branch: null, readAt: '2026-08-11T00:02:00.000Z' }
        : {
            branch: {
              id: 'br-created', project_id: 'project-preview-1', parent_id: 'br-preview-parent',
              name: `crm-search-e2e-${sha.slice(0, 12)}`, init_source: 'parent-data',
              created_at: '2026-08-11T00:00:00.000Z', expires_at: '2026-08-11T06:00:00.000Z'
            },
            readAt: '2026-08-11T00:00:30.000Z'
          }
      if (step.action === 'assert-empty') return {
        organisationScopeId: approval.payload.organisationScopeId,
        checkedAt: '2026-08-11T00:00:40.000Z',
        tables: { crm_people: 0, crm_companies: 0, crm_opportunities: 0 }
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
        projectId: 'project-preview-1', expectedProjectId: 'project-preview-1',
        parentBranchId: 'br-preview-parent', implementationSha: sha,
        nowMs: Date.parse('2026-08-11T00:00:00.000Z')
      }),
      trustedSharedEndpointDenyset: ['ep-production-shared-a1b2c3d4'],
      signing: { signerKeyId: 'crm-search-task18-test-key', privateKey },
      execute
    })).rejects.toThrow('crm_search_neon_schema_only_readback_required')
    expect(execute.mock.calls.map(([step]) => step.action)).toEqual([
      'create', 'poll', 'read-branch', 'delete', 'poll', 'read-branch'
    ])
  })

  it('performs a fresh direct-Neon revocation readback immediately before create and migrate', async () => {
    const approval = migrationApprovalFixture()
    const execute = vi.fn(async (step: { action: string, phase?: string }) => {
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
      if (step.action === 'read-branch') return step.phase === 'post-delete'
        ? { branch: null, readAt: '2026-08-11T00:02:00.000Z' }
        : {
            branch: {
              id: 'br-created', project_id: 'project-preview-1', parent_id: 'br-preview-parent',
              name: `crm-search-e2e-${sha.slice(0, 12)}`, init_source: 'parent-schema',
              created_at: '2026-08-11T00:00:00.000Z', expires_at: '2026-08-11T06:00:00.000Z'
            }, readAt: '2026-08-11T00:00:30.000Z'
          }
      if (step.action === 'assert-empty') return {
        organisationScopeId: approval.payload.organisationScopeId,
        checkedAt: '2026-08-11T00:00:40.000Z',
        tables: { crm_people: 0, crm_companies: 0, crm_opportunities: 0 }
      }
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
      'create', 'poll', 'read-branch', 'assert-empty', 'delete', 'poll', 'read-branch'
    ])
  })
})
