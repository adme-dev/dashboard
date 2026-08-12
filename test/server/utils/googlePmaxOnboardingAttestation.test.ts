import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createGooglePmaxOnboardingAttestation,
  getLatestGooglePmaxOnboardingAttestation
} from '~~/server/utils/googlePmaxOnboardingAttestation'
import { hashCanonicalLaunchJson } from '~~/server/utils/googlePmaxLaunchHash'
import { GooglePmaxRemoteDecisionError } from '~~/server/utils/googlePmaxRemoteDecisionEngine'
import {
  AttestationPolicyError,
  parseAttestationRow,
  prepareAttestation
} from '../../../workers/google-pmax-provider/src/attestationPolicy'

const mockTransaction = vi.fn()
const mockQueryRows = vi.fn()
const mockQuery = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: unknown[]) => mockTransaction(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const ids = {
  attestation: '9f6aca34-2ed4-4547-8e60-a3631e6d316e',
  launch: '5c4ca47b-df3a-43cd-b82f-a23a3f03a781',
  tenant: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  client: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  connection: '4f1206a1-fec7-491f-beed-662d9e9fc904',
  actor: '10ea5019-e05f-476f-971e-a73a3bc6930c'
}

const now = new Date('2026-08-07T10:00:00.000Z')
const config = {
  schemaVersion: 2,
  briefId: '23799282-283b-4508-b065-3fd36e8c05fd',
  briefVersion: 3,
  tenantId: ids.tenant,
  clientId: ids.client,
  connectionId: ids.connection,
  customerId: '7583977544',
  merchantCenterId: '5831245452',
  campaignName: 'Northern GAC Vehicles',
  budget: {
    currency: 'AUD',
    period: 'CUSTOM_PERIOD',
    startDate: '2026-08-08',
    endDate: '2026-09-06',
    campaignDays: 30,
    allocatedTotal: 700,
    dailyBudget: null,
    calculatedDailyPace: 700 / 30,
    provider: { totalAmountMicros: '700000000', amountMicros: null }
  },
  bidding: { strategy: 'MAXIMIZE_CONVERSIONS' },
  schedule: { startDate: '2026-08-08', endDate: '2026-09-06' },
  locations: [{ criterionId: '1000567', displayName: 'Bundoora VIC' }],
  languages: ['en'],
  finalUrls: ['https://northerngac.com.au/new-vehicles/'],
  inventorySource: {
    providerId: 'social-dashboard',
    linkId: '7e8396fd-1515-4e5e-a364-3d7c3a3dc1ac',
    feedId: 'google-vehicles-au',
    platform: 'google'
  },
  inventoryFilter: { listingSource: 'SHOPPING', conditions: ['NEW'] },
  assetGroup: {
    mode: 'PROVIDED',
    name: 'Northern GAC',
    businessName: 'Northern GAC',
    headlines: ['Explore vehicles', 'Book a test drive', 'View stock'],
    longHeadlines: ['Explore new GAC vehicles available today'],
    descriptions: ['Browse available stock.', 'Enquire with the team.'],
    imageAssetResourceNames: ['customers/7583977544/assets/10'],
    logoAssetResourceNames: ['customers/7583977544/assets/20'],
    youtubeVideoAssetResourceNames: []
  },
  conversionGoals: [{
    conversionActionId: '111',
    resourceName: 'customers/7583977544/conversionActions/111',
    category: 'SUBMIT_LEAD_FORM',
    origin: 'WEBSITE'
  }],
  approval: { required: true, complianceAcknowledged: true }
} as const
const configHash = hashCanonicalLaunchJson(config)

const policy = {
  async prepareAttestation(input: Parameters<typeof prepareAttestation>[0]) {
    try {
      return prepareAttestation(input)
    } catch (error) {
      if (error instanceof AttestationPolicyError) throw new GooglePmaxRemoteDecisionError(error.code)
      throw error
    }
  },
  async parseAttestation(row: Record<string, unknown>, current: string) {
    return parseAttestationRow(row, current)
  }
}

function evidence() {
  return {
    countryCode: 'AU',
    platform: {
      googleCloudProjectId: 'gen-lang-client-0818792107',
      oauth: {
        clientConfigured: true,
        consentScreenConfigured: true,
        offlineAccessGranted: true,
        googleAdsScopeGranted: true,
        merchantScopeGranted: true,
        businessProfileScopeGranted: true
      },
      googleAdsApi: { enabled: true, developerTokenAccess: 'standard' },
      merchantApi: { enabled: true, createAndConfigureAccess: true, providerAccountId: 'accounts/agency' },
      businessProfileApis: { enabled: true, access: 'approved' }
    },
    googleAds: {
      customerId: '758-397-7544',
      managerCustomerId: '1234567890',
      status: 'active',
      adminAccess: true,
      apiAccess: true,
      clientAccountCreationEligible: true,
      currencyCode: 'AUD',
      timeZone: 'Australia/Melbourne',
      billingStatus: 'active',
      policyStatus: 'clear'
    },
    merchant: {
      accountId: '5831245452',
      status: 'active',
      adminAccess: true,
      apiAccess: true,
      clientAdminPresent: true,
      termsOfService: 'accepted',
      businessInformation: 'complete',
      homepage: 'claimed'
    },
    businessProfile: {
      accountId: 'accounts/100',
      locationId: 'locations/200',
      storeCode: 'BUNDOORA',
      verified: true,
      apiAccess: true,
      accessRole: 'owner',
      locationStatus: 'active',
      duplicateCheck: 'clear',
      physicalStoreConfirmed: true
    },
    dealershipLocations: {
      source: 'business_profile',
      storeDataSourceId: null,
      storeDataSourceStatus: 'not_used',
      storeCodes: ['BUNDOORA']
    },
    feed: { storeCodes: ['BUNDOORA'], destination: 'VEHICLE_ADS_ONLY' },
    links: { adsToMerchant: 'active', merchantToBusinessProfile: 'active' },
    vehicleAds: {
      addon: 'enabled',
      dealershipLicenseReview: 'approved',
      websiteReview: 'approved',
      accountStateScope: 'single_state'
    }
  }
}

function rowFromParams(params: unknown[], overrides: Record<string, unknown> = {}) {
  const snapshot = JSON.parse(String(params[7]))
  return {
    id: ids.attestation,
    launch_id: ids.launch,
    config_version: 3,
    config_hash: configHash,
    snapshot_hash: snapshot.snapshotHash,
    snapshot,
    reason: params[8],
    attested_by: ids.actor,
    attested_at: params[10],
    expires_at: params[11],
    created_at: params[10],
    ...overrides
  }
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    launchId: ids.launch,
    tenantId: ids.tenant,
    actorId: ids.actor,
    configVersion: 3,
    configHash,
    config: config as never,
    evidence: evidence(),
    reason: 'Verified against Google admin surfaces and client-supplied licence evidence.',
    now: () => now,
    ...overrides
  }
}

describe('Google PMax onboarding attestation store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation(async callback => callback({ query: mockQuery }))
  })

  it('writes a canonical 30-day attestation only while the exact launch is preflightable', async () => {
    mockQuery.mockImplementation(async (sql: string, params: unknown[]) => {
      expect(sql).toContain(`launch.state IN ('DRAFT', 'PREFLIGHT_FAILED')`)
      return { rows: [rowFromParams(params)] }
    })

    const result = await createGooglePmaxOnboardingAttestation(input(), policy)

    expect(result.isReplay).toBe(false)
    expect(result.attestation).toMatchObject({
      launchId: ids.launch,
      configVersion: 3,
      active: true,
      evidence: { countryCode: 'AU' }
    })
    expect(result.attestation.expiresAt).toBe('2026-09-06T10:00:00.000Z')
  })

  it('rejects evidence for another Google Ads or Merchant identity before persistence', async () => {
    await expect(createGooglePmaxOnboardingAttestation(input({
      evidence: { ...evidence(), googleAds: { ...evidence().googleAds, customerId: '9999999999' } }
    }), policy)).rejects.toMatchObject({ code: 'PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('rejects a config object that does not produce the launch config hash', async () => {
    await expect(createGooglePmaxOnboardingAttestation(input({
      config: { ...config, campaignName: 'Substituted campaign' }
    }), policy)).rejects.toMatchObject({ code: 'PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('rejects unknown fields so credentials cannot be smuggled into the ledger', async () => {
    await expect(createGooglePmaxOnboardingAttestation(input({
      evidence: { ...evidence(), accessToken: 'prohibited' }
    }), policy)).rejects.toMatchObject({ code: 'PMAX_ONBOARDING_ATTESTATION_INVALID' })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('returns an exact idempotent replay for the same actor and evidence', async () => {
    let insertedParams: unknown[] = []
    mockQuery
      .mockImplementationOnce(async (_sql: string, params: unknown[]) => {
        insertedParams = params
        return { rows: [] }
      })
      .mockImplementationOnce(async () => ({ rows: [rowFromParams(insertedParams)] }))

    await expect(createGooglePmaxOnboardingAttestation(input(), policy)).resolves.toMatchObject({ isReplay: true })
  })

  it('reads only a non-expired attestation by default', async () => {
    let paramsForRow: unknown[] = []
    mockQuery.mockImplementationOnce(async (_sql: string, params: unknown[]) => {
      paramsForRow = params
      return { rows: [rowFromParams(params)] }
    })
    const created = await createGooglePmaxOnboardingAttestation(input(), policy)
    mockQueryRows.mockResolvedValueOnce([{
      id: created.attestation.id,
      launch_id: created.attestation.launchId,
      config_version: created.attestation.configVersion,
      config_hash: created.attestation.configHash,
      snapshot_hash: created.attestation.snapshotHash,
      snapshot: JSON.parse(String(paramsForRow[7])),
      reason: created.attestation.reason,
      attested_by: created.attestation.attestedBy,
      attested_at: created.attestation.attestedAt,
      expires_at: created.attestation.expiresAt,
      created_at: created.attestation.createdAt
    }])

    const result = await getLatestGooglePmaxOnboardingAttestation({
      launchId: ids.launch,
      tenantId: ids.tenant,
      configVersion: 3,
      configHash,
      now: () => now
    }, policy)

    expect(mockQueryRows.mock.calls[0]?.[0]).toContain('attestation.expires_at > $5::timestamptz')
    expect(result?.active).toBe(true)
  })
})
