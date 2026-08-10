import { describe, expect, it, vi } from 'vitest'

import {
  finalizeCrmSearchClientTeardown,
  requestCrmSearchClientTeardown
} from '~~/server/utils/crm/searchIndex/teardown'

const organisationScopeId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const teardownId = '33333333-3333-4333-8333-333333333333'
const namespace = 'oNmEHqD21LtKoRd1vUFkSadsyBM8y9jelSpv6UfJjy4'

const snapshot = {
  id: teardownId,
  organisationScopeId,
  clientId,
  policyRevision: 12,
  namespace,
  state: 'pending',
  providerDeletionState: 'pending',
  clientExists: false,
  policyExists: false,
  vectors: [
    {
      entityType: 'company',
      entityId: '44444444-4444-4444-8444-444444444444',
      schemaVersion: 'crm-search-v1',
      vectorId: 'v-active',
      namespace,
      sourceRevision: 7,
      deletionState: 'pending'
    },
    {
      entityType: 'company',
      entityId: '44444444-4444-4444-8444-444444444444',
      schemaVersion: 'crm-search-v2',
      vectorId: 'v-candidate',
      namespace,
      sourceRevision: 7,
      deletionState: 'pending'
    },
    {
      entityType: 'company',
      entityId: '44444444-4444-4444-8444-444444444444',
      schemaVersion: 'crm-search-v3',
      vectorId: 'v-retiring',
      namespace,
      sourceRevision: 7,
      deletionState: 'pending'
    }
  ]
}

function requestDependencies(overrides: Record<string, unknown> = {}) {
  return {
    loadGlobalControl: vi.fn().mockResolvedValue({ state: 'delete_only', revision: 9 }),
    loadDurableTeardownSnapshot: vi.fn().mockResolvedValue(snapshot),
    createDeleteOperation: vi.fn().mockResolvedValue(true),
    markTeardownDeleting: vi.fn().mockResolvedValue(true),
    ...overrides
  }
}

describe('CRM search client teardown', () => {
  it('schedules every snapshotted active/candidate/retiring vector after client and policy loss', async () => {
    const deps = requestDependencies()

    await expect(requestCrmSearchClientTeardown({
      organisationScopeId,
      clientId,
      teardownId,
      limit: 25,
      requestedAt: '2026-08-10T00:00:00.000Z'
    }, deps as never)).resolves.toEqual({
      teardownId,
      vectorsScanned: 3,
      deleteOperationsCreated: 3,
      complete: false
    })

    expect(deps.createDeleteOperation).toHaveBeenCalledTimes(3)
    expect(deps.createDeleteOperation.mock.calls.map(([value]) => value.schemaVersion))
      .toEqual(['crm-search-v1', 'crm-search-v2', 'crm-search-v3'])
    for (const [value] of deps.createDeleteOperation.mock.calls) {
      expect(value).toMatchObject({
        organisationScopeId,
        clientId,
        teardownId,
        namespace,
        desiredAction: 'delete',
        contentHash: null
      })
    }
  })

  it.each(['enabled', 'delete_only'])('accepts durable delete authority under global %s', async (state) => {
    const deps = requestDependencies({
      loadGlobalControl: vi.fn().mockResolvedValue({ state, revision: 9 })
    })

    await expect(requestCrmSearchClientTeardown({
      organisationScopeId,
      clientId,
      teardownId,
      limit: 25,
      requestedAt: '2026-08-10T00:00:00.000Z'
    }, deps as never)).resolves.toMatchObject({ deleteOperationsCreated: 3 })
  })

  it('fails closed under halted control without touching teardown work', async () => {
    const deps = requestDependencies({
      loadGlobalControl: vi.fn().mockResolvedValue({ state: 'halted', revision: 10 })
    })

    await expect(requestCrmSearchClientTeardown({
      organisationScopeId,
      clientId,
      teardownId,
      limit: 25,
      requestedAt: '2026-08-10T00:00:00.000Z'
    }, deps as never)).rejects.toThrow('crm_search_teardown_not_authorized')
    expect(deps.loadDurableTeardownSnapshot).not.toHaveBeenCalled()
    expect(deps.createDeleteOperation).not.toHaveBeenCalled()
  })

  it('does not report teardown complete until every exact provider absence is durable', async () => {
    const markTeardownConfirmed = vi.fn().mockResolvedValue(true)
    const markNamespaceProviderEmpty = vi.fn().mockResolvedValue(true)
    const dependencies = {
      loadTeardownProgress: vi.fn().mockResolvedValue({
        ...snapshot,
        state: 'provider_pending',
        providerDeletionState: 'partially_confirmed',
        vectors: snapshot.vectors.map((vector, index) => ({
          ...vector,
          deletionState: index === 2 ? 'provider_pending' : 'confirmed_absent'
        }))
      }),
      markTeardownConfirmed,
      markNamespaceProviderEmpty
    }

    await expect(finalizeCrmSearchClientTeardown({
      teardownId,
      confirmedAt: '2026-08-10T00:15:00.000Z'
    }, dependencies as never)).resolves.toEqual({
      teardownId,
      status: 'provider_pending'
    })
    expect(markTeardownConfirmed).not.toHaveBeenCalled()
    expect(markNamespaceProviderEmpty).not.toHaveBeenCalled()
  })

  it('marks the namespace reusable only after all snapshotted vectors are confirmed absent', async () => {
    const markTeardownConfirmed = vi.fn().mockResolvedValue(true)
    const markNamespaceProviderEmpty = vi.fn().mockResolvedValue(true)
    const dependencies = {
      loadTeardownProgress: vi.fn().mockResolvedValue({
        ...snapshot,
        state: 'provider_pending',
        providerDeletionState: 'partially_confirmed',
        vectors: snapshot.vectors.map(vector => ({
          ...vector,
          deletionState: 'confirmed_absent',
          confirmedAbsentAt: '2026-08-10T00:14:00.000Z'
        }))
      }),
      markTeardownConfirmed,
      markNamespaceProviderEmpty
    }

    await expect(finalizeCrmSearchClientTeardown({
      teardownId,
      confirmedAt: '2026-08-10T00:15:00.000Z'
    }, dependencies as never)).resolves.toEqual({
      teardownId,
      status: 'confirmed_absent'
    })
    expect(markTeardownConfirmed).toHaveBeenCalledBefore(markNamespaceProviderEmpty)
    expect(markNamespaceProviderEmpty).toHaveBeenCalledWith(expect.objectContaining({
      organisationScopeId,
      clientId,
      namespace
    }))
  })
})
