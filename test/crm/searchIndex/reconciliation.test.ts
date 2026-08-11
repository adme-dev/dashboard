import { describe, expect, it, vi } from 'vitest'

import { crmSearchRepositoryDependencies } from '~~/server/utils/crm/searchIndex/repository'
import {
  createDefaultCrmSearchReconciliationDependencies,
  reconcileCrmSearchIndex
} from '~~/server/utils/crm/searchIndex/reconciliation'

const organisationScopeId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const operationId = '33333333-3333-4333-8333-333333333333'
const documentId = '44444444-4444-4444-8444-444444444444'
const namespace = 'oNmEHqD21LtKoRd1vUFkSadsyBM8y9jelSpv6UfJjy4'
const vectorId = 'ohuXvpFaoi6E5QOIoE3zaeRuh-jOjPq5-JYyn0S6ajE'
const confirmationTag = `hmac-sha256:${'a'.repeat(64)}`

function pending(action: 'upsert' | 'delete' = 'upsert') {
  return {
    operationId,
    documentId,
    organisationScopeId,
    clientId,
    entityType: 'company',
    entityId: '55555555-5555-4555-8555-555555555555',
    schemaVersion: 'crm-search-v1',
    schemaRole: 'active',
    sourceRevision: 7,
    sourceEventSequence: 12,
    action,
    vectorId,
    namespace,
    confirmationTag: action === 'upsert' ? confirmationTag : null,
    confirmationKeyVersion: action === 'upsert' ? 'k1' : null,
    providerMutationId: action === 'upsert' ? 'mutation-upsert-1' : 'mutation-delete-1',
    providerAttemptCount: 1,
    confirmationAttemptCount: 1,
    leaseToken: '66666666-6666-4666-8666-666666666666',
    leaseGeneration: 3
  }
}

function dependencies(claims: unknown[]) {
  return {
    claimPendingConfirmations: vi.fn().mockResolvedValue(claims),
    claimInventoryRepairs: vi.fn().mockResolvedValue([]),
    confirmIndexed: vi.fn().mockResolvedValue(true),
    confirmDeleted: vi.fn().mockResolvedValue(true),
    rescheduleConfirmation: vi.fn().mockResolvedValue(true),
    recoverAmbiguousAcceptance: vi.fn().mockResolvedValue(true),
    recordConfirmationDeadLetter: vi.fn().mockResolvedValue(true),
    createRepairOperation: vi.fn().mockResolvedValue(true),
    resolveRepairEvidence: vi.fn().mockResolvedValue(true),
    schedulePendingTeardowns: vi.fn().mockResolvedValue({ scheduled: 0, finalized: 0 })
  }
}

describe('CRM search reconciliation', () => {
  it('inventories exact source, dirty, document, operation, and retirement state in bounded order', async () => {
    const queryRowsFresh = vi.spyOn(crmSearchRepositoryDependencies, 'queryRowsFresh')
      .mockResolvedValue([])
    try {
      const deps = createDefaultCrmSearchReconciliationDependencies()
      await expect(deps.claimInventoryRepairs({
        limit: 25,
        now: '2026-08-10T00:00:00.000Z'
      })).resolves.toEqual([])
      const sql = String(queryRowsFresh.mock.calls[0]?.[0])
      for (const table of [
        'crm_people', 'crm_companies', 'crm_opportunities',
        'crm_search_source_dirty', 'crm_search_documents',
        'crm_search_operations', 'crm_search_schema_retirement_work'
      ]) expect(sql).toContain(table)
      expect(sql).toMatch(/organisation_scope_id[\s\S]*client_id[\s\S]*schema_version/i)
      expect(sql).toMatch(/ORDER BY[\s\S]*LIMIT \$1/i)
    } finally {
      queryRowsFresh.mockRestore()
    }
  })

  it('uses the production scheduler for resumable teardown work and exact completion', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    const transaction = vi.spyOn(crmSearchRepositoryDependencies, 'transactionWithoutRetry')
      .mockImplementation(async callback => await callback({ query } as never))
    try {
      const deps = createDefaultCrmSearchReconciliationDependencies()
      await expect(deps.schedulePendingTeardowns({
        limit: 25,
        now: '2026-08-10T00:00:00.000Z'
      })).resolves.toEqual({ scheduled: 0, finalized: 0 })
      const sql = query.mock.calls.map(call => String(call[0])).join('\n')
      expect(sql).toContain('UPDATE crm_search_client_teardowns')
      expect(sql).toContain('state = \'confirmed\'')
      expect(sql).toContain('UPDATE crm_search_namespaces')
      expect(sql).toContain('crm_search_teardown_vectors')
      expect(sql).toContain('operation.state NOT IN (\'confirmed\', \'superseded\', \'terminal_dead_letter\')')
      expect(sql).toContain('FOR UPDATE OF vector, teardown SKIP LOCKED')
    } finally {
      transaction.mockRestore()
    }
  })

  it('claims only due work and prioritizes manual-now operations ahead of future backoff', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const transactionSpy = vi.spyOn(crmSearchRepositoryDependencies, 'transactionWithoutRetry')
      .mockImplementation(async work => await work({ query } as never))
    try {
      const deps = createDefaultCrmSearchReconciliationDependencies()

      await expect(deps.claimPendingConfirmations({
        limit: 25,
        now: '2026-08-11T01:02:03.456Z'
      })).resolves.toEqual([])

      const claimSql = String(query.mock.calls[0]?.[0])
      expect(claimSql).toMatch(/operation\.next_attempt_at\s*<=\s*\$1(?:::TIMESTAMPTZ)?/i)
      expect(claimSql).toMatch(/ORDER\s+BY\s+operation\.next_attempt_at,\s*document\.updated_at,\s*document\.id/i)
      expect(claimSql).toMatch(/operation\.state\s*=\s*'provider_pending'\s+OR\s+EXISTS[\s\S]*attempt\.provider\s*=\s*'vectorize'[\s\S]*attempt\.state\s*=\s*'ambiguous'/i)
    } finally {
      transactionSpy.mockRestore()
    }
  })

  it('confirms an upsert only for the exact canonical namespace, active schema, revision, key, and tag', async () => {
    const claim = pending('upsert')
    const runtime = {
      vectorize: {
        getByIds: vi.fn().mockResolvedValue([{
          id: vectorId,
          namespace,
          values: new Float32Array(768).fill(0.125),
          metadata: {
            entityType: 'company',
            schemaVersion: 'crm-search-v1',
            sourceRevision: 7,
            confirmationTag,
            confirmationKeyVersion: 'k1'
          }
        }])
      }
    }
    const deps = dependencies([claim])

    await expect(reconcileCrmSearchIndex({
      limit: 25,
      now: '2026-08-10T00:00:00.000Z'
    }, runtime as never, deps as never)).resolves.toEqual({
      claimed: 1,
      indexed: 1,
      deleted: 0,
      rescheduled: 0,
      deadLettered: 0,
      repairsCreated: 0,
      teardownsScheduled: 0,
      teardownsFinalized: 0
    })

    expect(runtime.vectorize.getByIds).toHaveBeenCalledWith([vectorId])
    expect(deps.confirmIndexed).toHaveBeenCalledWith(expect.objectContaining({
      operationId,
      documentId,
      providerMutationId: 'mutation-upsert-1',
      sourceRevision: 7,
      namespace,
      schemaVersion: 'crm-search-v1'
    }))
    expect(deps.confirmIndexed.mock.calls[0]?.[0]).not.toHaveProperty('values')
  })

  it.each([
    { namespace: `${namespace}x`, label: 'foreign namespace' },
    { schemaVersion: 'crm-search-v2', label: 'wrong schema' },
    { sourceRevision: 6, label: 'stale revision' },
    { confirmationKeyVersion: 'k0', label: 'wrong key version' },
    { confirmationTag: `hmac-sha256:${'b'.repeat(64)}`, label: 'wrong tag' }
  ])('reschedules rather than confirms a $label', async (metadataOverride) => {
    const runtime = {
      vectorize: {
        getByIds: vi.fn().mockResolvedValue([{
          id: vectorId,
          namespace: metadataOverride.namespace ?? namespace,
          metadata: {
            entityType: 'company',
            schemaVersion: metadataOverride.schemaVersion ?? 'crm-search-v1',
            sourceRevision: metadataOverride.sourceRevision ?? 7,
            confirmationTag: metadataOverride.confirmationTag ?? confirmationTag,
            confirmationKeyVersion: metadataOverride.confirmationKeyVersion ?? 'k1'
          }
        }])
      }
    }
    const deps = dependencies([pending('upsert')])

    const result = await reconcileCrmSearchIndex({
      limit: 25,
      now: '2026-08-10T00:00:00.000Z'
    }, runtime as never, deps as never)

    expect(result).toMatchObject({ indexed: 0, rescheduled: 1 })
    expect(deps.confirmIndexed).not.toHaveBeenCalled()
    expect(deps.rescheduleConfirmation).toHaveBeenCalledOnce()
  })

  it('confirms deletion only after exact-ID absence and never logs or persists returned values', async () => {
    const runtime = {
      vectorize: { getByIds: vi.fn().mockResolvedValue([]) }
    }
    const deps = dependencies([pending('delete')])

    const result = await reconcileCrmSearchIndex({
      limit: 25,
      now: '2026-08-10T00:00:00.000Z'
    }, runtime as never, deps as never)

    expect(result).toMatchObject({ deleted: 1, rescheduled: 0 })
    expect(deps.confirmDeleted).toHaveBeenCalledWith(expect.objectContaining({
      operationId,
      documentId,
      vectorId,
      namespace,
      providerMutationId: 'mutation-delete-1'
    }))
  })

  it('does not confirm deletion while the exact vector remains present', async () => {
    const runtime = {
      vectorize: {
        getByIds: vi.fn().mockResolvedValue([{ id: vectorId, namespace, metadata: {} }])
      }
    }
    const deps = dependencies([pending('delete')])

    const result = await reconcileCrmSearchIndex({
      limit: 25,
      now: '2026-08-10T00:00:00.000Z'
    }, runtime as never, deps as never)

    expect(result).toMatchObject({ deleted: 0, rescheduled: 1 })
    expect(deps.confirmDeleted).not.toHaveBeenCalled()
  })

  it('converges an ambiguously accepted mutation by exact read without blind resubmission', async () => {
    const claim = { ...pending('upsert'), providerMutationId: null, ambiguousAttemptId: 'attempt-1' }
    const runtime = {
      vectorize: {
        getByIds: vi.fn().mockResolvedValue([{
          id: vectorId,
          namespace,
          metadata: {
            entityType: 'company',
            schemaVersion: 'crm-search-v1',
            sourceRevision: 7,
            confirmationTag,
            confirmationKeyVersion: 'k1'
          }
        }]),
        upsert: vi.fn(),
        deleteByIds: vi.fn()
      }
    }
    const deps = dependencies([claim])

    const result = await reconcileCrmSearchIndex({
      limit: 25,
      now: '2026-08-10T00:00:00.000Z'
    }, runtime as never, deps as never)

    expect(result).toMatchObject({ indexed: 1 })
    expect(deps.recoverAmbiguousAcceptance).toHaveBeenCalledWith(expect.objectContaining({
      ambiguousAttemptId: 'attempt-1'
    }))
    expect(runtime.vectorize.upsert).not.toHaveBeenCalled()
    expect(runtime.vectorize.deleteByIds).not.toHaveBeenCalled()
  })

  it('moves exhausted confirmation work only to a provider_confirmation dead letter', async () => {
    const runtime = { vectorize: { getByIds: vi.fn().mockResolvedValue([]) } }
    const deps = dependencies([{
      ...pending('upsert'),
      confirmationAttemptCount: 10,
      confirmationDeadlineAt: '2026-08-09T23:00:00.000Z'
    }])

    const result = await reconcileCrmSearchIndex({
      limit: 25,
      now: '2026-08-10T00:00:00.000Z'
    }, runtime as never, deps as never)

    expect(result).toMatchObject({ deadLettered: 1, rescheduled: 0 })
    expect(deps.recordConfirmationDeadLetter).toHaveBeenCalledWith(expect.objectContaining({
      operationId,
      origin: 'provider_confirmation'
    }))
  })

  it('creates bounded exact repair operations for stale and orphaned inventory without blind replay', async () => {
    const staleVectorId = vectorId
    const orphanVectorId = 'bhuXvpFaoi6E5QOIoE3zaeRuh-jOjPq5-JYyn0S6ajE'
    const deps = dependencies([])
    deps.claimInventoryRepairs.mockResolvedValue([
      {
        repairKind: 'stale', organisationScopeId, clientId, entityType: 'company',
        entityId: '55555555-5555-4555-8555-555555555555', schemaVersion: 'crm-search-v1',
        schemaRole: 'active', sourceRevision: 8, desiredAction: 'upsert',
        vectorId: staleVectorId, namespace, contentHash: 'b'.repeat(64),
        confirmationTag: `hmac-sha256:${'c'.repeat(64)}`, confirmationKeyVersion: 'k1'
      },
      {
        repairKind: 'orphaned', organisationScopeId, clientId, entityType: 'company',
        entityId: '77777777-7777-4777-8777-777777777777', schemaVersion: 'crm-search-v1',
        schemaRole: 'retiring', sourceRevision: 4, desiredAction: 'delete',
        vectorId: orphanVectorId, namespace, contentHash: null,
        confirmationTag: null, confirmationKeyVersion: null
      }
    ])
    const runtime = {
      vectorize: {
        getByIds: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: orphanVectorId, namespace, metadata: {} }]),
        upsert: vi.fn(),
        deleteByIds: vi.fn()
      }
    }

    await expect(reconcileCrmSearchIndex({
      limit: 25,
      now: '2026-08-10T00:00:00.000Z'
    }, runtime as never, deps as never)).resolves.toMatchObject({
      repairsCreated: 2
    })

    expect(deps.claimInventoryRepairs).toHaveBeenCalledWith({
      limit: 25,
      now: '2026-08-10T00:00:00.000Z'
    })
    expect(deps.createRepairOperation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      repairKind: 'stale', desiredAction: 'upsert', sourceRevision: 8
    }))
    expect(deps.createRepairOperation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      repairKind: 'orphaned', desiredAction: 'delete', vectorId: orphanVectorId
    }))
    expect(runtime.vectorize.upsert).not.toHaveBeenCalled()
    expect(runtime.vectorize.deleteByIds).not.toHaveBeenCalled()
  })

  it('runs pending teardown scheduling even when no confirmation claim exists', async () => {
    const deps = dependencies([])
    deps.schedulePendingTeardowns.mockResolvedValue({ scheduled: 3, finalized: 1 })
    const runtime = { vectorize: { getByIds: vi.fn() } }

    await expect(reconcileCrmSearchIndex({
      limit: 25,
      now: '2026-08-10T00:00:00.000Z'
    }, runtime as never, deps as never)).resolves.toMatchObject({
      teardownsScheduled: 3,
      teardownsFinalized: 1
    })
    expect(deps.schedulePendingTeardowns).toHaveBeenCalledWith({
      limit: 25,
      now: '2026-08-10T00:00:00.000Z'
    })
  })
})
