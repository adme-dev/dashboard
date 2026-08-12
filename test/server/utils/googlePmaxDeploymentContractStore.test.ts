import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createGooglePmaxDeploymentContract,
  transitionGooglePmaxDeploymentContract
} from '~~/server/utils/googlePmaxDeploymentContractStore'
import { normalizeGooglePmaxDeploymentContract } from '~~/server/utils/googlePmaxDeploymentContract'

const mockTransaction = vi.fn()
const mockQuery = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

const ids = {
  contract: '5c4ca47b-df3a-43cd-b82f-a23a3f03a781',
  tenant: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  client: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  connector: '4f1206a1-fec7-491f-beed-662d9e9fc904',
  connection: 'a338b7d4-f54f-4892-a1d2-7406ab7bc981',
  trackingSite: '37d55218-5d75-465d-9bf3-4dec4f542d76',
  actor: '10ea5019-e05f-476f-971e-a73a3bc6930c'
}

const contractInput = {
  schemaVersion: 1 as const,
  tenantId: ids.tenant,
  clientId: ids.client,
  legalAdvertiserName: 'Northern Isuzu UTE',
  source: {
    connectorId: ids.connector,
    kind: 'SUPABASE' as const,
    sellerIds: ['northern-isuzu-ute'],
    requiredSaleStatus: 'For Sale' as const
  },
  merchant: {
    accountId: '5507471616',
    dataSourceId: '10705683272',
    feedLabel: 'Northern Isuzu UTE products',
    targetCountry: 'AU' as const,
    contentLanguage: 'en' as const,
    storeCodeMode: 'ACCOUNT_WIDE' as const,
    storeCodes: []
  },
  ads: {
    connectionId: ids.connection,
    customerId: '9962002158',
    campaignId: '22035417335',
    assetGroupIds: ['10000000001']
  },
  campaign: {
    objective: 'VEHICLE_SALES' as const,
    sourceConditions: ['NEW' as const],
    excludedMakes: [],
    excludedModels: []
  },
  measurement: {
    trackingSiteId: ids.trackingSite,
    domains: ['northernisuzuute.com.au']
  }
}
const normalized = normalizeGooglePmaxDeploymentContract(contractInput)

function contractRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.contract,
    tenant_id: ids.tenant,
    client_id: ids.client,
    contract_version: 1,
    contract_hash: normalized.contractHash,
    source_connector_id: ids.connector,
    merchant_account_id: '5507471616',
    merchant_data_source_id: '10705683272',
    ads_connection_id: ids.connection,
    ads_customer_id: '9962002158',
    ads_campaign_id: '22035417335',
    tracking_site_id: ids.trackingSite,
    brief_id: null,
    project_id: null,
    campaign_launch_id: null,
    normalized_contract: normalized.contract,
    state: 'DRAFT',
    created_by: ids.actor,
    created_at: '2026-08-12T10:00:00.000Z',
    updated_at: '2026-08-12T10:00:00.000Z',
    verified_at: null,
    activated_at: null,
    ...overrides
  }
}

describe('Google PMax deployment contract store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery.mockReset()
    mockTransaction.mockReset()
    mockTransaction.mockImplementation(async (callback: (db: { query: typeof mockQuery }) => unknown) => (
      callback({ query: mockQuery })
    ))
  })

  it('creates the normalized contract and initial event atomically', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [contractRow()] })
      .mockResolvedValueOnce({ rows: [] })

    const result = await createGooglePmaxDeploymentContract({
      contractInput,
      contractVersion: 1,
      actorId: ids.actor
    })

    expect(result).toEqual({
      deploymentContract: expect.objectContaining({ state: 'DRAFT', clientId: ids.client }),
      isReplay: false
    })
    expect(mockQuery.mock.calls[0]?.[0]).toContain('pg_advisory_xact_lock')
    expect(mockQuery.mock.calls[1]?.[0]).toContain('INSERT INTO google_pmax_deployment_contracts')
    expect(mockQuery.mock.calls[2]?.[0]).toContain('INSERT INTO google_pmax_deployment_contract_events')
  })

  it('returns an exact hash replay without duplicating the event', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [contractRow()] })

    await expect(createGooglePmaxDeploymentContract({
      contractInput,
      contractVersion: 1,
      actorId: ids.actor
    })).resolves.toEqual({
      deploymentContract: expect.objectContaining({ id: ids.contract }),
      isReplay: true
    })
    expect(mockQuery).toHaveBeenCalledTimes(3)
    expect(mockQuery.mock.calls[2]?.[0]).toContain('FOR UPDATE')
  })

  it('fails closed when the requested version already identifies different evidence', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))

    await expect(createGooglePmaxDeploymentContract({
      contractInput,
      contractVersion: 1,
      actorId: ids.actor
    })).rejects.toMatchObject({ code: 'DEPLOYMENT_VERSION_CONFLICT' })
  })

  it('locks, compare-and-sets and records verification evidence', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [contractRow()] }
      if (sql.includes('UPDATE google_pmax_deployment_contracts')) {
        return { rows: [contractRow({ state: 'VERIFIED', verified_at: '2026-08-12T10:05:00.000Z' })] }
      }
      return { rows: [] }
    })

    const result = await transitionGooglePmaxDeploymentContract({
      deploymentContractId: ids.contract,
      tenantId: ids.tenant,
      expectedState: 'DRAFT',
      toState: 'VERIFIED',
      actorId: ids.actor,
      eventType: 'OFFICIAL_READBACK_VERIFIED',
      evidence: { merchantProductCount: 184, soldOfferCount: 0 }
    })

    expect(result.state).toBe('VERIFIED')
    expect(mockQuery.mock.calls[0]?.[0]).toContain('FOR UPDATE')
    expect(mockQuery.mock.calls[1]?.[0]).toMatch(/state = \$3[\s\S]*state = \$4/)
    expect(JSON.parse(String(mockQuery.mock.calls[2]?.[1]?.[7]))).toEqual({
      merchantProductCount: 184,
      soldOfferCount: 0
    })
  })

  it('rejects invalid state transitions before writing', async () => {
    await expect(transitionGooglePmaxDeploymentContract({
      deploymentContractId: ids.contract,
      tenantId: ids.tenant,
      expectedState: 'DRAFT',
      toState: 'ACTIVE',
      actorId: ids.actor,
      eventType: 'BYPASS_VERIFICATION'
    })).rejects.toMatchObject({ code: 'DEPLOYMENT_TRANSITION_INVALID' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('rejects sensitive verification evidence before opening a transaction', async () => {
    await expect(transitionGooglePmaxDeploymentContract({
      deploymentContractId: ids.contract,
      tenantId: ids.tenant,
      expectedState: 'DRAFT',
      toState: 'VERIFIED',
      actorId: ids.actor,
      eventType: 'OFFICIAL_READBACK_VERIFIED',
      evidence: { apiKey: 'must-not-be-recorded' }
    })).rejects.toMatchObject({ code: 'DEPLOYMENT_EVIDENCE_REJECTED' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
