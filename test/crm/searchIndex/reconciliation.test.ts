import { describe, expect, it, vi } from 'vitest'

import { reconcileCrmSearchIndex } from '~~/server/utils/crm/searchIndex/reconciliation'

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
    confirmIndexed: vi.fn().mockResolvedValue(true),
    confirmDeleted: vi.fn().mockResolvedValue(true),
    rescheduleConfirmation: vi.fn().mockResolvedValue(true),
    recoverAmbiguousAcceptance: vi.fn().mockResolvedValue(true),
    recordConfirmationDeadLetter: vi.fn().mockResolvedValue(true),
    createRepairOperation: vi.fn().mockResolvedValue(true)
  }
}

describe('CRM search reconciliation', () => {
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
      repairsCreated: 0
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
})
