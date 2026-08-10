import { describe, expect, it, vi } from 'vitest'

import {
  buildNeonLifecyclePlan,
  createNeonTargetAttestation,
  runNeonLifecycle
} from '../../scripts/crm-search/neon-lifecycle.mjs'
import { generateKeyPairSync } from 'node:crypto'

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
    const execute = vi.fn()
    const result = await runNeonLifecycle({
      dryRun: true,
      plan: buildNeonLifecyclePlan({
        projectId: 'project-preview-1',
        expectedProjectId: 'project-preview-1',
        parentBranchId: 'br-preview-parent',
        implementationSha: 'a'.repeat(40),
        nowMs: Date.parse('2026-08-11T00:00:00.000Z')
      }),
      execute
    })
    expect(result).toMatchObject({ dryRun: true, mutationCount: 0 })
    expect(execute).not.toHaveBeenCalled()
  })

  it('models one outer finally and always requests exact branch cleanup after failure', async () => {
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
      mutationAuthorization: {
        version: 'crm-search-neon-mutation-authorization-v1',
        purpose: 'crm-search-task18-neon-lifecycle', environment: 'preview',
        approvalId: '40000000-0000-4000-8000-000000000001', approvalRevision: 7,
        approvalType: 'production_migration', projectId: 'project-preview-1',
        expiresAt: '2026-08-12T00:00:00.000Z'
      },
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
      mutationAuthorization: {
        version: 'crm-search-neon-mutation-authorization-v1',
        purpose: 'crm-search-task18-neon-lifecycle', environment: 'preview',
        approvalId: '40000000-0000-4000-8000-000000000001', approvalRevision: 7,
        approvalType: 'production_migration', projectId: 'prj-crm-search-e2e',
        expiresAt: '2026-08-12T00:00:00.000Z'
      },
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
      apiResponseSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      attestationSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    })
    expect(Object.keys(result.attestation.migrationDigests)).toEqual(result.attestation.migrationPaths)
    expect(calls).toEqual(['create', 'poll', 'assert-empty', 'migrate', 'delete', 'poll'])
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
  })
})
