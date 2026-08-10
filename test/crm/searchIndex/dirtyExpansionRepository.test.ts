import { describe, expect, it, vi } from 'vitest'

import type { CrmSearchConfirmationKeyring } from '../../../server/utils/crm/searchIndex/confirmation'
import {
  expandCrmSearchDirtySourceBatch,
  type CrmSearchDirtyExpansionRepositoryDependencies
} from '../../../server/utils/crm/searchIndex/dirtyExpansionRepository'

const NOW = '2033-05-18T03:33:20.000Z'
const claim = {
  id: '11111111-1111-4111-8111-111111111111',
  organisationScopeId: '22222222-2222-4222-8222-222222222222',
  clientId: '33333333-3333-4333-8333-333333333333',
  entityType: 'company' as const,
  entityId: '44444444-4444-4444-8444-444444444444',
  sourceRevision: 4,
  desiredAction: 'upsert' as const,
  eventSequence: 14,
  claimToken: '55555555-5555-4555-8555-555555555555',
  claimGeneration: 2,
  claimLeaseExpiresAt: '2033-05-18T03:34:20.000Z',
  attemptCount: 1
}
const keyring: CrmSearchConfirmationKeyring = {
  activeKeyVersion: 'confirm-v1',
  keys: { 'confirm-v1': Buffer.alloc(32, 0x44).toString('base64url') }
}

function defaultQuery(sql: string) {
  if (sql.includes('pg_advisory_xact_lock_shared')) return { rows: [{}] }
  if (sql.includes('FROM crm_search_global_control')) {
    return { rows: [{ state: 'enabled', indexing_ready: true, revision: '7' }] }
  }
  if (sql.includes('FROM crm_search_policies')) {
    return { rows: [{
      lifecycle_state: 'indexing',
      indexing_enabled: true,
      active_schema_version: 'crm-search-v1',
      candidate_schema_version: null,
      retiring_schema_versions: []
    }] }
  }
  if (sql.includes('FROM crm_search_namespaces')) {
    return { rows: [{ namespace: 'canonical_namespace_123' }] }
  }
  if (sql.includes('FROM crm_companies')) {
    return { rows: [{
      search_revision: '4',
      deleted_at: null,
      content_hash: 'a'.repeat(64)
    }] }
  }
  if (sql.includes('FROM crm_search_documents') || sql.includes('FROM crm_search_teardown_vectors')) {
    return { rows: [] }
  }
  throw new Error(`unexpected SQL contract: ${sql}`)
}

function dependencies(
  overrides: Partial<CrmSearchDirtyExpansionRepositoryDependencies> = {}
): CrmSearchDirtyExpansionRepositoryDependencies {
  const query = vi.fn(async (sql: string) => defaultQuery(sql))
  return {
    claimDirtySources: vi.fn(async () => [claim]),
    transactionWithoutRetry: vi.fn(async callback => await callback({ query } as never)),
    deriveVectorId: vi.fn(async () => 'derived_vector_id_123'),
    createConfirmationTag: vi.fn(async () => ({
      confirmationTag: `hmac-sha256:${'b'.repeat(64)}`,
      confirmationKeyVersion: 'confirm-v1'
    })),
    upsertOperation: vi.fn(async input => ({ id: `${input.schemaVersion}:operation` } as never)),
    completeDirtyClaim: vi.fn(async () => true),
    releaseDirtyClaim: vi.fn(async () => true),
    ...overrides
  }
}

describe('CRM search dirty-source expansion repository', () => {
  it('locks fresh authority before source projection and creates the active-schema intent', async () => {
    const deps = dependencies()
    await expect(expandCrmSearchDirtySourceBatch({
      limit: 25,
      leaseSeconds: 60,
      now: NOW,
      confirmationKeyring: keyring
    }, deps)).resolves.toEqual({
      dirtyClaimed: 1,
      operationsCreated: 1,
      skippedByControl: 0
    })

    expect(deps.upsertOperation).toHaveBeenCalledWith({
      organisationScopeId: claim.organisationScopeId,
      clientId: claim.clientId,
      entityType: claim.entityType,
      entityId: claim.entityId,
      schemaVersion: 'crm-search-v1',
      sourceRevision: 4,
      sourceEventSequence: 14,
      desiredAction: 'upsert',
      vectorId: 'derived_vector_id_123',
      namespace: 'canonical_namespace_123',
      contentHash: 'a'.repeat(64),
      confirmationTag: `hmac-sha256:${'b'.repeat(64)}`,
      confirmationKeyVersion: 'confirm-v1'
    }, expect.anything())
    expect(deps.completeDirtyClaim).toHaveBeenCalledWith(claim, expect.anything())

    const transaction = vi.mocked(deps.transactionWithoutRetry).mock.calls[0]![0]
    expect(transaction).toBeTypeOf('function')
    const query = (await vi.mocked(deps.transactionWithoutRetry).mock.results[0]!.value)
    expect(query).toBeDefined()
  })

  it.each([
    'halted',
    'enabled-off-policy',
    'delete_only'
  ] as const)('retains dirty intent without operation expansion when authority is %s', async (mode) => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock_shared')) return { rows: [{}] }
      if (sql.includes('FROM crm_search_global_control')) {
        return { rows: [{
          state: mode === 'halted' ? 'halted' : mode === 'delete_only' ? 'delete_only' : 'enabled',
          indexing_ready: mode === 'enabled-off-policy',
          revision: '7'
        }] }
      }
      if (sql.includes('FROM crm_search_policies')) {
        return { rows: [{
          lifecycle_state: 'off', indexing_enabled: false,
          active_schema_version: null, candidate_schema_version: null,
          retiring_schema_versions: []
        }] }
      }
      throw new Error(`unexpected SQL after disabled authority: ${sql}`)
    })
    const deps = dependencies({
      transactionWithoutRetry: vi.fn(async callback => await callback({ query } as never))
    })
    const result = await expandCrmSearchDirtySourceBatch({
      limit: 25,
      leaseSeconds: 60,
      now: NOW,
      confirmationKeyring: keyring
    }, deps)

    expect(result).toEqual({
      dirtyClaimed: 1,
      operationsCreated: 0,
      skippedByControl: 1
    })
    expect(deps.upsertOperation).not.toHaveBeenCalled()
    expect(deps.completeDirtyClaim).not.toHaveBeenCalled()
    expect(deps.releaseDirtyClaim).toHaveBeenCalledWith(expect.objectContaining({
      id: claim.id,
      errorClass: 'control_disabled'
    }), expect.anything())
  })

  it('allows delete-only to fan out deletes without reading confirmation key material', async () => {
    const deleteClaim = { ...claim, desiredAction: 'delete' as const }
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock_shared')) return { rows: [{}] }
      if (sql.includes('FROM crm_search_global_control')) {
        return { rows: [{ state: 'delete_only', indexing_ready: false, revision: '8' }] }
      }
      if (sql.includes('FROM crm_search_policies')) {
        return { rows: [{
          lifecycle_state: 'off', indexing_enabled: false,
          active_schema_version: null, candidate_schema_version: null,
          retiring_schema_versions: []
        }] }
      }
      if (sql.includes('FROM crm_search_namespaces')) {
        return { rows: [{ namespace: 'canonical_namespace_123' }] }
      }
      if (sql.includes('FROM crm_search_documents')) {
        return { rows: [{
          schema_version: 'crm-search-v1',
          vector_id: 'ledger_vector_id_123',
          namespace: 'canonical_namespace_123'
        }] }
      }
      if (sql.includes('FROM crm_search_teardown_vectors')) return { rows: [] }
      if (sql.includes('FROM crm_companies')) return { rows: [] }
      throw new Error(`unexpected delete SQL: ${sql}`)
    })
    const createConfirmationTag = vi.fn()
    const deps = dependencies({
      claimDirtySources: async () => [deleteClaim],
      transactionWithoutRetry: vi.fn(async callback => await callback({ query } as never)),
      createConfirmationTag
    })

    await expect(expandCrmSearchDirtySourceBatch({
      limit: 25,
      leaseSeconds: 60,
      now: NOW,
      confirmationKeyring: null
    }, deps)).resolves.toMatchObject({ operationsCreated: 1, skippedByControl: 0 })
    expect(createConfirmationTag).not.toHaveBeenCalled()
    expect(deps.upsertOperation).toHaveBeenCalledWith(expect.objectContaining({
      desiredAction: 'delete',
      vectorId: 'ledger_vector_id_123',
      contentHash: null,
      confirmationTag: null,
      confirmationKeyVersion: null
    }), expect.anything())
  })

  it('retains an ordinary delete while its client policy is off under globally enabled control', async () => {
    const deleteClaim = { ...claim, desiredAction: 'delete' as const }
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock_shared')) return { rows: [{}] }
      if (sql.includes('FROM crm_search_global_control')) {
        return { rows: [{ state: 'enabled', indexing_ready: true, revision: '8' }] }
      }
      if (sql.includes('FROM crm_search_policies')) {
        return { rows: [{
          lifecycle_state: 'off', indexing_enabled: false,
          active_schema_version: null, candidate_schema_version: null,
          retiring_schema_versions: []
        }] }
      }
      if (sql.includes('FROM crm_search_namespaces')) return { rows: [] }
      if (sql.includes('FROM crm_search_documents')) {
        return { rows: [{
          schema_version: 'crm-search-v1',
          vector_id: 'ledger_vector_id_123',
          namespace: 'canonical_namespace_123'
        }] }
      }
      if (sql.includes('FROM crm_search_teardown_vectors')) return { rows: [] }
      throw new Error(`unexpected off-policy delete SQL: ${sql}`)
    })
    const deps = dependencies({
      claimDirtySources: async () => [deleteClaim],
      transactionWithoutRetry: vi.fn(async callback => await callback({ query } as never))
    })

    await expect(expandCrmSearchDirtySourceBatch({
      limit: 25, leaseSeconds: 60, now: NOW, confirmationKeyring: null
    }, deps)).resolves.toEqual({
      dirtyClaimed: 1,
      operationsCreated: 0,
      skippedByControl: 1
    })
    expect(deps.upsertOperation).not.toHaveBeenCalled()
    expect(deps.releaseDirtyClaim).toHaveBeenCalledWith(expect.objectContaining({
      errorClass: 'control_disabled'
    }), expect.anything())
  })

  it('uses the independent active teardown snapshot to authorize delete after policy removal', async () => {
    const deleteClaim = { ...claim, desiredAction: 'delete' as const }
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock_shared')) return { rows: [{}] }
      if (sql.includes('FROM crm_search_global_control')) {
        return { rows: [{ state: 'enabled', indexing_ready: true, revision: '8' }] }
      }
      if (sql.includes('FROM crm_search_policies')) return { rows: [] }
      if (sql.includes('FROM crm_search_namespaces')) return { rows: [] }
      if (sql.includes('FROM crm_search_documents')) return { rows: [] }
      if (sql.includes('FROM crm_search_teardown_vectors')) {
        return { rows: [{
          schema_version: 'crm-search-v1',
          vector_id: 'teardown_vector_id_123',
          namespace: 'canonical_namespace_123'
        }] }
      }
      throw new Error(`unexpected teardown delete SQL: ${sql}`)
    })
    const deps = dependencies({
      claimDirtySources: async () => [deleteClaim],
      transactionWithoutRetry: vi.fn(async callback => await callback({ query } as never))
    })

    await expect(expandCrmSearchDirtySourceBatch({
      limit: 25, leaseSeconds: 60, now: NOW, confirmationKeyring: null
    }, deps)).resolves.toMatchObject({ operationsCreated: 1, skippedByControl: 0 })
    expect(deps.upsertOperation).toHaveBeenCalledWith(expect.objectContaining({
      desiredAction: 'delete',
      vectorId: 'teardown_vector_id_123'
    }), expect.anything())
  })

  it('releases rather than expanding when the source revision has advanced', async () => {
    const query = vi.fn(async (sql: string) => {
      const result = defaultQuery(sql)
      if (sql.includes('FROM crm_companies')) {
        return { rows: [{ search_revision: '5', deleted_at: null, content_hash: 'c'.repeat(64) }] }
      }
      return result
    })
    const deps = dependencies({
      transactionWithoutRetry: vi.fn(async callback => await callback({ query } as never))
    })
    await expect(expandCrmSearchDirtySourceBatch({
      limit: 25, leaseSeconds: 60, now: NOW, confirmationKeyring: keyring
    }, deps)).resolves.toMatchObject({ operationsCreated: 0 })
    expect(deps.releaseDirtyClaim).toHaveBeenCalledWith(expect.objectContaining({
      errorClass: 'source_superseded'
    }), expect.anything())
    expect(deps.upsertOperation).not.toHaveBeenCalled()
  })

  it('fails closed and retains upsert intent when the confirmation keyring is absent', async () => {
    const deps = dependencies()
    await expect(expandCrmSearchDirtySourceBatch({
      limit: 25, leaseSeconds: 60, now: NOW, confirmationKeyring: null
    }, deps)).resolves.toMatchObject({ operationsCreated: 0 })
    expect(deps.releaseDirtyClaim).toHaveBeenCalledWith(expect.objectContaining({
      errorClass: 'confirmation_key_unavailable'
    }), expect.anything())
    expect(deps.upsertOperation).not.toHaveBeenCalled()
  })
})
