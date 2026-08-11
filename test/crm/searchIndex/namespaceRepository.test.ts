import { describe, expect, it, vi } from 'vitest'
import { allocateCrmSearchNamespace } from '~~/server/utils/crm/searchIndex/namespaceRepository'

const organisationScopeId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const namespace = 'oNmEHqD21LtKoRd1vUFkSadsyBM8y9jelSpv6UfJjy4'

function identity(sourceTupleDigest = 'a'.repeat(64)) {
  return {
    value: namespace,
    sourceTuple: 'server-owned-framed-tuple',
    sourceTupleDigest,
    derivationRevision: 'namespace-sha256-base64url-v1' as const
  }
}

function capacityRow() {
  return {
    active_namespaces: '1', active_vectors: '10',
    candidate_namespaces: '0', candidate_vectors: '0',
    retiring_namespaces: '0', retiring_vectors: '0',
    sentinel_namespaces: '0', sentinel_vectors: '0',
    deletion_pending_namespaces: '0', deletion_pending_vectors: '0'
  }
}

describe('CRM search namespace repository', () => {
  it('derives server-owned identity, locks allocation, proves capacity, and inserts the digest', async () => {
    const row = {
      id: '33333333-3333-4333-8333-333333333333',
      organisation_scope_id: organisationScopeId,
      client_id: clientId,
      namespace,
      source_tuple_digest: 'a'.repeat(64),
      derivation_revision: 'namespace-sha256-base64url-v1',
      state: 'allocated',
      provider_confirmed_empty_at: null
    }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [capacityRow()] })
      .mockResolvedValueOnce({ rows: [row] })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))

    const result = await allocateCrmSearchNamespace({
      organisationScopeId,
      clientId,
      limits: { namespaces: 50_000, vectors: 20_000_000 }
    }, {
      deriveNamespaceIdentity: vi.fn().mockResolvedValue(identity()),
      transactionWithoutRetry
    } as never)

    expect(result).toMatchObject({ namespace, sourceTupleDigest: 'a'.repeat(64) })
    expect(query.mock.calls[0]?.[0]).toContain('pg_advisory_xact_lock')
    expect(query.mock.calls[0]?.[1]).toContain('crm-search-namespace-capacity-global')
    expect(query.mock.calls[2]?.[0]).toContain('crm_search_teardown_vectors')
    expect(query.mock.calls[3]?.[0]).toContain('INSERT INTO crm_search_namespaces')
  })

  it('rejects a forced namespace digest collision with a different source tuple', async () => {
    const existing = {
      id: '33333333-3333-4333-8333-333333333333',
      organisation_scope_id: organisationScopeId,
      client_id: clientId,
      namespace,
      source_tuple_digest: 'a'.repeat(64),
      derivation_revision: 'namespace-sha256-base64url-v1',
      state: 'active',
      provider_confirmed_empty_at: null
    }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existing] })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))

    await expect(allocateCrmSearchNamespace({
      organisationScopeId,
      clientId,
      limits: { namespaces: 50_000, vectors: 20_000_000 }
    }, {
      deriveNamespaceIdentity: vi.fn().mockResolvedValue(identity('b'.repeat(64))),
      transactionWithoutRetry
    } as never)).rejects.toThrow('crm_search_namespace_collision')
  })

  it('rejects an identity registered under a different derivation revision', async () => {
    const existing = {
      id: '33333333-3333-4333-8333-333333333333',
      organisation_scope_id: organisationScopeId,
      client_id: clientId,
      namespace,
      source_tuple_digest: 'a'.repeat(64),
      derivation_revision: 'obsolete-namespace-derivation',
      state: 'active',
      provider_confirmed_empty_at: null
    }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existing] })
    await expect(allocateCrmSearchNamespace({
      organisationScopeId,
      clientId,
      limits: { namespaces: 50_000, vectors: 20_000_000 }
    }, {
      deriveNamespaceIdentity: vi.fn().mockResolvedValue(identity()),
      transactionWithoutRetry: vi.fn(async callback => await callback({ query }))
    } as never)).rejects.toThrow('crm_search_namespace_collision')
  })

  it('rejects a provider namespace already owned by a different client', async () => {
    const existing = {
      id: '33333333-3333-4333-8333-333333333333',
      organisation_scope_id: organisationScopeId,
      client_id: '99999999-9999-4999-8999-999999999999',
      namespace,
      source_tuple_digest: 'a'.repeat(64),
      derivation_revision: 'namespace-sha256-base64url-v1',
      state: 'active',
      provider_confirmed_empty_at: null
    }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existing] })
    await expect(allocateCrmSearchNamespace({
      organisationScopeId,
      clientId,
      limits: { namespaces: 50_000, vectors: 20_000_000 }
    }, {
      deriveNamespaceIdentity: vi.fn().mockResolvedValue(identity()),
      transactionWithoutRetry: vi.fn(async callback => await callback({ query }))
    } as never)).rejects.toThrow('crm_search_namespace_collision')
    expect(query.mock.calls[1]?.[0]).toContain('namespace = $3')
  })

  it('prevents reactivation until the prior deterministic namespace is provider-confirmed empty', async () => {
    const existing = {
      id: '33333333-3333-4333-8333-333333333333',
      organisation_scope_id: organisationScopeId,
      client_id: clientId,
      namespace,
      source_tuple_digest: 'a'.repeat(64),
      derivation_revision: 'namespace-sha256-base64url-v1',
      state: 'teardown_pending',
      provider_confirmed_empty_at: null
    }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existing] })
    await expect(allocateCrmSearchNamespace({
      organisationScopeId,
      clientId,
      limits: { namespaces: 50_000, vectors: 20_000_000 }
    }, {
      deriveNamespaceIdentity: vi.fn().mockResolvedValue(identity()),
      transactionWithoutRetry: vi.fn(async callback => await callback({ query }))
    } as never)).rejects.toThrow('crm_search_namespace_not_empty')
  })

  it('fails closed when either capacity limit is unknown or the independent 80% ceiling is reached', async () => {
    const transactionWithoutRetry = vi.fn()
    await expect(allocateCrmSearchNamespace({
      organisationScopeId,
      clientId,
      limits: { namespaces: null, vectors: 20_000_000 }
    }, {
      deriveNamespaceIdentity: vi.fn().mockResolvedValue(identity()),
      transactionWithoutRetry
    } as never)).rejects.toThrow('crm_search_capacity_unproven')
    expect(transactionWithoutRetry).not.toHaveBeenCalled()
  })

  it('reactivates only an exact provider-confirmed-empty namespace under the same digest', async () => {
    const existing = {
      id: '33333333-3333-4333-8333-333333333333',
      organisation_scope_id: organisationScopeId,
      client_id: clientId,
      namespace,
      source_tuple_digest: 'a'.repeat(64),
      derivation_revision: 'namespace-sha256-base64url-v1',
      state: 'provider_confirmed_empty',
      provider_confirmed_empty_at: '2026-08-10T00:00:00.000Z'
    }
    const reactivated = { ...existing, state: 'allocated', provider_confirmed_empty_at: null }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({ rows: [capacityRow()] })
      .mockResolvedValueOnce({ rows: [reactivated] })
    await expect(allocateCrmSearchNamespace({
      organisationScopeId,
      clientId,
      limits: { namespaces: 50_000, vectors: 20_000_000 }
    }, {
      deriveNamespaceIdentity: vi.fn().mockResolvedValue(identity()),
      transactionWithoutRetry: vi.fn(async callback => await callback({ query }))
    } as never)).resolves.toMatchObject({ state: 'allocated' })
    expect(query.mock.calls[3]?.[0]).toContain('state = \'allocated\'')
  })

  it('counts a provider-empty namespace again before reactivation at the strict ceiling', async () => {
    const existing = {
      id: '33333333-3333-4333-8333-333333333333',
      organisation_scope_id: organisationScopeId,
      client_id: clientId,
      namespace,
      source_tuple_digest: 'a'.repeat(64),
      derivation_revision: 'namespace-sha256-base64url-v1',
      state: 'provider_confirmed_empty',
      provider_confirmed_empty_at: '2026-08-10T00:00:00.000Z'
    }
    const atBoundary = { ...capacityRow(), active_namespaces: '39999' }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({ rows: [atBoundary] })
    await expect(allocateCrmSearchNamespace({
      organisationScopeId,
      clientId,
      limits: { namespaces: 50_000, vectors: 20_000_000 }
    }, {
      deriveNamespaceIdentity: vi.fn().mockResolvedValue(identity()),
      transactionWithoutRetry: vi.fn(async callback => await callback({ query }))
    } as never)).rejects.toThrow('crm_search_capacity_unproven')
    expect(query).toHaveBeenCalledTimes(3)
  })
})
