import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createCrmSemanticJoinBackDependencies,
  joinBackSemanticCandidates,
  type CrmSearchLedgerCandidate,
  type CrmSearchSemanticCurrentRow
} from '~~/server/utils/crm/semanticJoinBack'
import {
  deriveCrmSearchNamespace,
  deriveCrmSearchVectorId
} from '~~/server/utils/crm/searchIndex/identity'

const ORGANISATION_ID = '00000000-0000-4000-8000-000000000001'
const CLIENT_ID = '00000000-0000-4000-8000-000000000002'
const ACTOR_ID = '00000000-0000-4000-8000-000000000003'
const COMPANY_ID = '00000000-0000-4000-8000-000000000004'
const SCHEMA_VERSION = 'crm-search-v1'

const context = {
  organisationScopeId: ORGANISATION_ID,
  clientId: CLIENT_ID,
  correlationId: '00000000-0000-4000-8000-000000000005',
  actorType: 'staff' as const,
  actorId: ACTOR_ID,
  surface: 'agency_ai' as const,
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: true }
}

let namespace: string
let companyVectorId: string

beforeAll(async () => {
  namespace = await deriveCrmSearchNamespace({
    organisationScopeId: ORGANISATION_ID,
    clientId: CLIENT_ID
  })
  companyVectorId = await deriveCrmSearchVectorId({
    organisationScopeId: ORGANISATION_ID,
    clientId: CLIENT_ID,
    schemaVersion: SCHEMA_VERSION,
    entityType: 'company',
    entityId: COMPANY_ID
  })
})

function ledger(overrides: Partial<CrmSearchLedgerCandidate> = {}): CrmSearchLedgerCandidate {
  return {
    organisationScopeId: ORGANISATION_ID,
    clientId: CLIENT_ID,
    schemaVersion: SCHEMA_VERSION,
    namespace,
    vectorId: companyVectorId,
    entityType: 'company',
    entityId: COMPANY_ID,
    sourceRevision: 7,
    confirmationState: 'indexed',
    tombstone: false,
    ...overrides
  }
}

function current(overrides: Partial<CrmSearchSemanticCurrentRow> = {}): CrmSearchSemanticCurrentRow {
  return {
    organisationScopeId: ORGANISATION_ID,
    clientId: CLIENT_ID,
    entityType: 'company',
    entityId: COMPANY_ID,
    sourceRevision: 7,
    deletedAt: null,
    authorized: true,
    title: 'Acme',
    subtitle: 'acme.example',
    ...overrides
  }
}

function dependencies(options: {
  ledgers?: CrmSearchLedgerCandidate[]
  currentRows?: CrmSearchSemanticCurrentRow[]
  freshContext?: typeof context | null
} = {}) {
  return {
    loadLedgerCandidates: vi.fn().mockResolvedValue(options.ledgers ?? [ledger()]),
    revalidateContext: vi.fn().mockResolvedValue(
      options.freshContext === undefined ? context : options.freshContext
    ),
    loadCurrentRows: vi.fn().mockResolvedValue(options.currentRows ?? [current()]),
    recordSecurityRejection: vi.fn().mockResolvedValue(undefined)
  }
}

describe('CRM semantic Postgres authority join-back', () => {
  it('forwards bounded security rejections to the injected persistence adapter', async () => {
    const recordSecurityRejection = vi.fn().mockResolvedValue(undefined)
    const deps = createCrmSemanticJoinBackDependencies(
      vi.fn().mockResolvedValue(context),
      recordSecurityRejection
    )
    const rejection = {
      correlationId: context.correlationId,
      reasonClass: 'foreign_candidate' as const,
      entityType: 'company' as const
    }

    await deps.recordSecurityRejection(rejection)

    expect(recordSecurityRejection).toHaveBeenCalledWith(rejection)
    expect(JSON.stringify(recordSecurityRejection.mock.calls)).not.toContain('Acme')
  })

  it('queries the ledger by canonical scope, active schema, namespace, vector IDs, indexed state, and no tombstone', async () => {
    const deps = dependencies()
    const result = await joinBackSemanticCandidates({
      context,
      activeSchemaVersion: SCHEMA_VERSION,
      canonicalNamespace: namespace,
      candidates: [{ vectorId: companyVectorId, score: 0.91, semanticRank: 1 }]
    }, deps)

    expect(deps.loadLedgerCandidates).toHaveBeenCalledWith({
      organisationScopeId: ORGANISATION_ID,
      clientId: CLIENT_ID,
      activeSchemaVersion: SCHEMA_VERSION,
      canonicalNamespace: namespace,
      vectorIds: [companyVectorId],
      confirmationState: 'indexed',
      tombstone: false
    })
    expect(deps.revalidateContext).toHaveBeenCalledWith(context)
    expect(deps.loadCurrentRows).toHaveBeenCalledWith({
      context,
      references: [{
        entityType: 'company',
        entityId: COMPANY_ID,
        sourceRevision: 7
      }]
    })
    expect(result).toEqual([{
      entityType: 'company',
      entityId: COMPANY_ID,
      title: 'Acme',
      subtitle: 'acme.example',
      score: 0.91,
      semanticRank: 1
    }])
  })

  it.each([
    ['foreign organisation', { organisationScopeId: '00000000-0000-4000-8000-000000000099' }],
    ['foreign client', { clientId: '00000000-0000-4000-8000-000000000099' }],
    ['inactive schema', { schemaVersion: 'crm-search-v2' }],
    ['foreign namespace', { namespace: 'z'.repeat(43) }],
    ['mismatched vector identity', { vectorId: 'z'.repeat(43) }],
    ['provider pending', { confirmationState: 'provider_pending' as const }],
    ['tombstoned', { tombstone: true }]
  ])('drops and records a %s ledger row returned by an untrusted adapter', async (_label, overrides) => {
    const deps = dependencies({ ledgers: [ledger(overrides)] })
    await expect(joinBackSemanticCandidates({
      context,
      activeSchemaVersion: SCHEMA_VERSION,
      canonicalNamespace: namespace,
      candidates: [{ vectorId: companyVectorId, score: 0.91, semanticRank: 1 }]
    }, deps)).resolves.toEqual([])
    expect(deps.loadCurrentRows).not.toHaveBeenCalled()
    expect(deps.recordSecurityRejection).toHaveBeenCalledWith(expect.objectContaining({
      correlationId: context.correlationId,
      reasonClass: 'foreign_candidate'
    }))
  })

  it.each([
    ['deleted', { deletedAt: '2026-08-10T00:00:00.000Z' }],
    ['stale revision', { sourceRevision: 8 }],
    ['unauthorized', { authorized: false }],
    ['foreign current client', { clientId: '00000000-0000-4000-8000-000000000099' }]
  ])('drops and records a %s current Postgres row after fresh authorization', async (_label, overrides) => {
    const deps = dependencies({ currentRows: [current(overrides)] })
    await expect(joinBackSemanticCandidates({
      context,
      activeSchemaVersion: SCHEMA_VERSION,
      canonicalNamespace: namespace,
      candidates: [{ vectorId: companyVectorId, score: 0.91, semanticRank: 1 }]
    }, deps)).resolves.toEqual([])
    expect(deps.recordSecurityRejection).toHaveBeenCalledWith(expect.objectContaining({
      correlationId: context.correlationId
    }))
  })

  it('fails the semantic branch when fresh session/client/permission/owner authority is revoked', async () => {
    const deps = dependencies({ freshContext: null })
    await expect(joinBackSemanticCandidates({
      context,
      activeSchemaVersion: SCHEMA_VERSION,
      canonicalNamespace: namespace,
      candidates: [{ vectorId: companyVectorId, score: 0.91, semanticRank: 1 }]
    }, deps)).rejects.toThrow('crm_search_authorization_changed')
    expect(deps.loadCurrentRows).not.toHaveBeenCalled()
  })

  it('does not authorize a candidate from caller/provider metadata when no ledger row exists', async () => {
    const deps = dependencies({ ledgers: [] })
    await expect(joinBackSemanticCandidates({
      context,
      activeSchemaVersion: SCHEMA_VERSION,
      canonicalNamespace: namespace,
      candidates: [{
        vectorId: companyVectorId,
        score: 0.99,
        semanticRank: 1,
        metadata: {
          clientId: CLIENT_ID,
          entityType: 'company',
          entityId: COMPANY_ID,
          title: 'Provider title'
        }
      } as never]
    }, deps)).resolves.toEqual([])
    expect(deps.revalidateContext).not.toHaveBeenCalled()
    expect(deps.loadCurrentRows).not.toHaveBeenCalled()
  })
})
