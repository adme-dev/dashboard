import { describe, expect, it, vi } from 'vitest'
import {
  claimCrmSearchTeardownVectors,
  completeCrmSearchTeardownVectorClaim,
  requireCrmSearchTeardownDeleteAuthority
} from '~~/server/utils/crm/searchIndex/teardownRepository'

const organisationScopeId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const teardownId = '33333333-3333-4333-8333-333333333333'
const vectorId = 'vector-id'

describe('CRM search teardown repository', () => {
  it('authorizes post-client-delete provider deletion from the independent teardown snapshot', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ state: 'delete_only', revision: '12' }] })
      .mockResolvedValueOnce({ rows: [{
        teardown_id: teardownId,
        teardown_state: 'deleting',
        provider_deletion_state: 'pending',
        policy_revision: '5',
        vector_id: vectorId,
        schema_version: 'crm-search-v1',
        namespace: 'namespace-id',
        deletion_state: 'pending',
        source_revision: '4'
      }] })

    await expect(requireCrmSearchTeardownDeleteAuthority({
      organisationScopeId,
      clientId,
      teardownId,
      vectorId,
      schemaVersion: 'crm-search-v1'
    }, { query } as never)).resolves.toMatchObject({
      controlRevision: 12,
      policyRevision: 5,
      namespace: 'namespace-id'
    })
    expect(query.mock.calls.flatMap(call => call).join('\n')).not.toContain('crm_search_policies')
    expect(query.mock.calls[0]?.[0]).toContain('FOR SHARE')
    expect(query.mock.calls[1]?.[0]).toContain('FOR UPDATE')
  })

  it.each(['halted', 'unknown'])('fails closed under %s global control', async (state) => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ state, revision: '12' }] })
    await expect(requireCrmSearchTeardownDeleteAuthority({
      organisationScopeId,
      clientId,
      teardownId,
      vectorId,
      schemaVersion: 'crm-search-v1'
    }, { query } as never)).rejects.toThrow('crm_search_teardown_not_authorized')
  })

  it('claims teardown vectors in bounded batches and preserves snapshot identity', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      id: '44444444-4444-4444-8444-444444444444',
      teardown_id: teardownId,
      organisation_scope_id: organisationScopeId,
      client_id: clientId,
      entity_type: 'company',
      entity_id: '55555555-5555-4555-8555-555555555555',
      schema_version: 'crm-search-v1',
      vector_id: vectorId,
      namespace: 'namespace-id',
      source_revision: '4',
      deletion_state: 'pending',
      attempt_count: 1
    }] })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))
    const result = await claimCrmSearchTeardownVectors({ teardownId, limit: 25 }, {
      transactionWithoutRetry
    } as never)
    expect(result).toHaveLength(1)
    expect(query.mock.calls[0]?.[0]).toContain('FOR UPDATE SKIP LOCKED')
  })

  it('confirms absence only with teardown/vector/state/provider-mutation CAS', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 })
    await expect(completeCrmSearchTeardownVectorClaim({
      teardownId,
      vectorId,
      schemaVersion: 'crm-search-v1',
      expectedDeletionState: 'provider_pending',
      expectedProviderMutationId: 'mutation-1',
      confirmedAbsentAt: '2026-08-10T00:00:00.000Z'
    }, { query } as never)).resolves.toBe(true)
    const sql = query.mock.calls[0]?.[0] as string
    expect(sql).toContain('teardown_id = $1')
    expect(sql).toContain('vector_id = $2')
    expect(sql).toContain('schema_version = $3')
    expect(sql).toContain('provider_mutation_id = $5')
  })
})
