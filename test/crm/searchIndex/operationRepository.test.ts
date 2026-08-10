import { describe, expect, it, vi } from 'vitest'
import {
  admitCrmSearchOperation,
  claimCrmSearchOperations,
  completeCrmSearchOperationClaim,
  upsertCrmSearchOperation
} from '~~/server/utils/crm/searchIndex/operationRepository'
import {
  completeCrmSearchDocumentClaim,
  upsertCrmSearchDocumentCas
} from '~~/server/utils/crm/searchIndex/documentRepository'

const base = {
  organisationScopeId: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
  entityType: 'company' as const,
  entityId: '33333333-3333-4333-8333-333333333333',
  schemaVersion: 'crm-search-v1',
  desiredAction: 'upsert' as const,
  vectorId: 'vector-id',
  namespace: 'namespace-id',
  contentHash: 'a'.repeat(64),
  confirmationTag: `hmac-sha256:${'b'.repeat(64)}`,
  confirmationKeyVersion: 'k1'
}

const operationRow = {
  id: '44444444-4444-4444-8444-444444444444',
  organisation_scope_id: base.organisationScopeId,
  client_id: base.clientId,
  entity_type: base.entityType,
  entity_id: base.entityId,
  schema_version: base.schemaVersion,
  source_revision: '3',
  source_event_sequence: '13',
  desired_action: base.desiredAction,
  vector_id: base.vectorId,
  namespace: base.namespace,
  content_hash: base.contentHash,
  confirmation_tag: base.confirmationTag,
  confirmation_key_version: base.confirmationKeyVersion,
  control_revision: '0',
  state: 'pending_transport',
  successor_of: null,
  lease_token: null,
  lease_generation: '0',
  lease_expires_at: null,
  provider_admitted_at: null,
  provider_mutation_id: null,
  provider_accepted_at: null
}

describe('CRM search operation repository', () => {
  it('keeps one admitted provider operation and replaces only its one coalesced successor', async () => {
    const pending = {
      ...operationRow,
      id: '55555555-5555-4555-8555-555555555555',
      state: 'provider_pending',
      provider_admitted_at: '2026-08-10T00:00:00.000Z',
      provider_mutation_id: 'mutation-1',
      provider_accepted_at: '2026-08-10T00:00:01.000Z'
    }
    const successor = {
      ...operationRow,
      id: '66666666-6666-4666-8666-666666666666',
      source_revision: '4',
      source_event_sequence: '14',
      successor_of: pending.id
    }
    const updated = { ...successor, source_revision: '5', source_event_sequence: '15' }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [pending, successor] })
      .mockResolvedValueOnce({ rows: [updated], rowCount: 1 })

    const result = await upsertCrmSearchOperation({
      ...base,
      sourceRevision: 5,
      sourceEventSequence: 15
    }, { query } as never)

    expect(result).toMatchObject({
      id: successor.id,
      sourceRevision: 5,
      sourceEventSequence: 15,
      successorOf: pending.id
    })
    expect(query.mock.calls[0]?.[0]).toContain('FOR UPDATE')
    expect(query.mock.calls[1]?.[0]).toContain('UPDATE crm_search_operations')
    expect(query.mock.calls[1]?.[0]).toContain('successor_of = $')
  })

  it('coalesces repeated pre-admission intent into one replaceable root', async () => {
    const updated = { ...operationRow, source_revision: '4', source_event_sequence: '14' }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [operationRow] })
      .mockResolvedValueOnce({ rows: [updated], rowCount: 1 })

    await expect(upsertCrmSearchOperation({
      ...base,
      sourceRevision: 4,
      sourceEventSequence: 14
    }, { query } as never)).resolves.toMatchObject({ sourceRevision: 4 })
    expect(query.mock.calls[1]?.[0]).toContain('successor_of IS NULL')
  })

  it('does not replace newer intent with an older revision/event pair', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [operationRow] })
    await expect(upsertCrmSearchOperation({
      ...base,
      sourceRevision: 2,
      sourceEventSequence: 12
    }, { query } as never)).resolves.toMatchObject({ sourceRevision: 3 })
    expect(query).toHaveBeenCalledOnce()
  })

  it('does not accept a higher revision carrying an older global event sequence', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [operationRow] })
    await expect(upsertCrmSearchOperation({
      ...base,
      sourceRevision: 4,
      sourceEventSequence: 12
    }, { query } as never)).resolves.toMatchObject({
      sourceRevision: 3,
      sourceEventSequence: 13
    })
    expect(query).toHaveBeenCalledOnce()
  })

  it('returns an exact terminal operation idempotently instead of inserting a duplicate root', async () => {
    const confirmed = {
      ...operationRow,
      state: 'confirmed',
      provider_admitted_at: '2026-08-10T00:00:00.000Z',
      provider_mutation_id: 'mutation-1',
      provider_accepted_at: '2026-08-10T00:00:01.000Z'
    }
    const query = vi.fn().mockResolvedValueOnce({ rows: [confirmed] })
    await expect(upsertCrmSearchOperation({
      ...base,
      sourceRevision: 3,
      sourceEventSequence: 13
    }, { query } as never)).resolves.toMatchObject({ id: confirmed.id, state: 'confirmed' })
    expect(query).toHaveBeenCalledOnce()
  })

  it('claims bounded operations with SKIP LOCKED and completes only by lease CAS', async () => {
    const claimed = {
      ...operationRow,
      state: 'processing',
      lease_token: '77777777-7777-4777-8777-777777777777',
      lease_generation: '2',
      lease_expires_at: '2026-08-10T00:01:00.000Z'
    }
    const claimQuery = vi.fn().mockResolvedValue({ rows: [claimed] })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query: claimQuery }))
    const [claim] = await claimCrmSearchOperations({
      limit: 10,
      leaseSeconds: 60,
      now: '2026-08-10T00:00:00.000Z'
    }, { transactionWithoutRetry } as never)

    expect(claimQuery.mock.calls[0]?.[0]).toContain('FOR UPDATE SKIP LOCKED')
    const completionQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 })
    await expect(completeCrmSearchOperationClaim({
      id: claim!.id,
      leaseToken: claim!.leaseToken!,
      leaseGeneration: claim!.leaseGeneration,
      expectedState: 'processing',
      nextState: 'retryable',
      errorClass: 'provider_unavailable',
      nextAttemptAt: '2026-08-10T00:05:00.000Z'
    }, { query: completionQuery } as never)).resolves.toBe(true)
    const sql = completionQuery.mock.calls[0]?.[0] as string
    expect(sql).toContain('lease_token = $2')
    expect(sql).toContain('lease_generation = $3')
    expect(sql).toContain('state = $4')
  })

  it('admits provider work only through the governed database function and returns the stamped revision', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      state: 'admitted', control_revision: '19', lease_generation: '4'
    }] })
    await expect(admitCrmSearchOperation({
      operationId: operationRow.id,
      expectedState: 'processing',
      expectedControlRevision: 19,
      leaseToken: '77777777-7777-4777-8777-777777777777',
      leaseGeneration: 4
    }, { query } as never)).resolves.toEqual({
      state: 'admitted', controlRevision: 19, leaseGeneration: 4
    })
    expect(query.mock.calls[0]?.[0]).toContain('crm_search_admit_operation')
  })

  it('updates document state only when source high-watermark and lease generation match', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: operationRow.id }], rowCount: 1 })
    await expect(upsertCrmSearchDocumentCas({
      ...base,
      sourceRevision: 4,
      sourceEventSequence: 14,
      confirmationState: 'provider_pending',
      tombstoned: false,
      providerMutationId: 'mutation-2',
      expectedSourceRevision: 3,
      expectedSourceEventSequence: 13
    }, { query } as never)).resolves.toBe(true)
    expect(query.mock.calls[0]?.[0]).toContain('source_revision = $')
    expect(query.mock.calls[0]?.[0]).toContain('source_event_sequence = $')
    expect(query.mock.calls[0]?.[0]).toContain('UPDATE crm_search_documents')
    expect(query.mock.calls[0]?.[0]).toContain('source_event_sequence < $')
  })

  it('inserts a document only from an explicit zero high-watermark', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: operationRow.id }], rowCount: 1 })
    await expect(upsertCrmSearchDocumentCas({
      ...base,
      sourceRevision: 1,
      sourceEventSequence: 1,
      confirmationState: 'provider_pending',
      tombstoned: false,
      providerMutationId: 'mutation-1',
      expectedSourceRevision: 0,
      expectedSourceEventSequence: 0
    }, { query } as never)).resolves.toBe(true)
    expect(query.mock.calls[0]?.[0]).toContain('INSERT INTO crm_search_documents')
  })

  it('rejects a document update that regresses either source high-watermark', async () => {
    const query = vi.fn()
    await expect(upsertCrmSearchDocumentCas({
      ...base,
      sourceRevision: 4,
      sourceEventSequence: 12,
      confirmationState: 'provider_pending',
      tombstoned: false,
      providerMutationId: 'mutation-2',
      expectedSourceRevision: 3,
      expectedSourceEventSequence: 13
    }, { query } as never)).rejects.toThrow('crm_search_invalid_document')
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects stale document confirmation CAS instead of advancing the ledger', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    await expect(completeCrmSearchDocumentClaim({
      documentId: operationRow.id,
      leaseToken: '77777777-7777-4777-8777-777777777777',
      leaseGeneration: 4,
      expectedConfirmationState: 'provider_pending',
      nextConfirmationState: 'indexed',
      expectedSourceRevision: 4,
      expectedProviderMutationId: 'mutation-2',
      providerHighWatermark: 14
    }, { query } as never)).resolves.toBe(false)
  })
})
