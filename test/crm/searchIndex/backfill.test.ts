import { describe, expect, it, vi } from 'vitest'

import { scheduleCrmSearchBackfill } from '~~/server/utils/crm/searchIndex/backfill'

const organisationScopeId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const approvalId = '33333333-3333-4333-8333-333333333333'
const namespace = 'oNmEHqD21LtKoRd1vUFkSadsyBM8y9jelSpv6UfJjy4'

const input = {
  organisationScopeId,
  clientId,
  candidateSchemaVersion: 'crm-search-v2',
  expectedPolicyRevision: 12,
  approvalId,
  limit: 25,
  requestedAt: '2026-08-10T00:00:00.000Z'
}

function authority(overrides: Record<string, unknown> = {}) {
  return {
    controlRevision: 9,
    policyRevision: 12,
    lifecycleState: 'indexing',
    indexingEnabled: true,
    activeSchemaVersion: 'crm-search-v1',
    candidateSchemaVersion: 'crm-search-v2',
    retiringSchemaVersions: [],
    candidateMetadataIndexState: 'ready',
    candidateSentinelState: 'confirmed_absent',
    namespace,
    capacityReady: true,
    approval: {
      id: approvalId,
      approvalType: 'client_indexing',
      expectedPolicyRevision: 12,
      unexpired: true,
      unrevoked: true,
      maximumCostUsdMicros: 50_000
    },
    ...overrides
  }
}

function dependencies(authorityValue = authority()) {
  return {
    loadBackfillAuthority: vi.fn().mockResolvedValue(authorityValue),
    listCurrentSources: vi.fn().mockResolvedValue([
      {
        entityType: 'company',
        entityId: '44444444-4444-4444-8444-444444444444',
        sourceRevision: 7,
        sourceEventSequence: 12,
        contentHash: 'a'.repeat(64)
      },
      {
        entityType: 'person',
        entityId: '55555555-5555-4555-8555-555555555555',
        sourceRevision: 4,
        sourceEventSequence: 13,
        contentHash: 'b'.repeat(64)
      }
    ]),
    createCandidateOperation: vi.fn().mockResolvedValue(true),
    recordBackfillAudit: vi.fn().mockResolvedValue(true)
  }
}

describe('CRM search candidate backfill scheduling', () => {
  it('creates bounded operations only for the candidate schema and canonical namespace', async () => {
    const deps = dependencies()

    await expect(scheduleCrmSearchBackfill(input, deps as never)).resolves.toEqual({
      scanned: 2,
      operationsCreated: 2,
      candidateSchemaVersion: 'crm-search-v2',
      complete: true
    })

    expect(deps.createCandidateOperation).toHaveBeenCalledTimes(2)
    for (const [candidate] of deps.createCandidateOperation.mock.calls) {
      expect(candidate).toMatchObject({
        organisationScopeId,
        clientId,
        schemaVersion: 'crm-search-v2',
        namespace,
        desiredAction: 'upsert'
      })
      expect(candidate.schemaVersion).not.toBe('crm-search-v1')
    }
    expect(deps.recordBackfillAudit).toHaveBeenCalledWith(expect.objectContaining({
      approvalId,
      candidateSchemaVersion: 'crm-search-v2',
      operationsCreated: 2
    }))
  })

  it('fails closed while any prior retiring schema remains', async () => {
    const deps = dependencies(authority({ retiringSchemaVersions: ['crm-search-v9'] }))

    await expect(scheduleCrmSearchBackfill(input, deps as never)).rejects.toThrow(
      'crm_search_backfill_prior_retirement_pending'
    )
    expect(deps.listCurrentSources).not.toHaveBeenCalled()
    expect(deps.createCandidateOperation).not.toHaveBeenCalled()
  })

  it.each([
    { candidateMetadataIndexState: 'pending', label: 'metadata indexes are pending' },
    { candidateSentinelState: 'query_verified', label: 'sentinel absence is unconfirmed' },
    { capacityReady: false, label: 'capacity is unproven' },
    { approval: null, label: 'approval is missing' },
    {
      approval: {
        id: approvalId,
        approvalType: 'client_indexing',
        expectedPolicyRevision: 12,
        unexpired: false,
        unrevoked: true,
        maximumCostUsdMicros: 50_000
      },
      label: 'approval is expired'
    }
  ])('creates no backfill work when $label', async (override) => {
    const deps = dependencies(authority(override))

    await expect(scheduleCrmSearchBackfill(input, deps as never)).rejects.toThrow(
      'crm_search_backfill_not_authorized'
    )
    expect(deps.createCandidateOperation).not.toHaveBeenCalled()
    expect(deps.recordBackfillAudit).not.toHaveBeenCalled()
  })

  it('rejects a stale policy revision before listing source rows', async () => {
    const deps = dependencies(authority({ policyRevision: 13 }))

    await expect(scheduleCrmSearchBackfill(input, deps as never)).rejects.toThrow(
      'crm_search_backfill_not_authorized'
    )
    expect(deps.listCurrentSources).not.toHaveBeenCalled()
  })
})
