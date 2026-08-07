import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashCanonicalLaunchJson } from '~~/server/utils/googlePmaxLaunchHash'
import { GooglePmaxLaunchConflictError } from '~~/server/utils/googlePmaxLaunchStore'

const mockRequirePermission = vi.fn()
const mockHasRole = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockRequireSocialClientAccess = vi.fn()
const mockRequireAllSocialClientAccess = vi.fn()
const mockListLaunches = vi.fn()
const mockGetLaunch = vi.fn()
const mockCreateLaunch = vi.fn()
const mockApproveLaunch = vi.fn()
const mockQueryOne = vi.fn()
const mockGetOnboardingAttestation = vi.fn()
const mockCreateOnboardingAttestation = vi.fn()

let query: Record<string, unknown> = {}
let body: Record<string, unknown> = {}
let launchId = '5c4ca47b-df3a-43cd-b82f-a23a3f03a781'

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler,
  getQuery: () => query,
  readBody: () => body,
  getRouterParam: () => launchId,
  createError: (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
}))

vi.mock('~~/server/utils/auth', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
  hasRole: (...args: unknown[]) => mockHasRole(...args)
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args)
}))

vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: (...args: unknown[]) => mockRequireSocialClientAccess(...args),
  requireAllSocialClientAccess: (...args: unknown[]) => mockRequireAllSocialClientAccess(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/googlePmaxLaunchStore', async (importOriginal) => {
  const original = await importOriginal<typeof import('~~/server/utils/googlePmaxLaunchStore')>()
  return {
    ...original,
    listGooglePmaxLaunches: (...args: unknown[]) => mockListLaunches(...args),
    getGooglePmaxLaunch: (...args: unknown[]) => mockGetLaunch(...args),
    createGooglePmaxLaunch: (...args: unknown[]) => mockCreateLaunch(...args),
    approveGooglePmaxLaunch: (...args: unknown[]) => mockApproveLaunch(...args)
  }
})

vi.mock('~~/server/utils/googlePmaxOnboardingAttestation', async (importOriginal) => {
  const original = await importOriginal<typeof import('~~/server/utils/googlePmaxOnboardingAttestation')>()
  return {
    ...original,
    getLatestGooglePmaxOnboardingAttestation: (...args: unknown[]) => mockGetOnboardingAttestation(...args),
    createGooglePmaxOnboardingAttestation: (...args: unknown[]) => mockCreateOnboardingAttestation(...args)
  }
})

const ids = {
  tenant: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  brief: '23799282-283b-4508-b065-3fd36e8c05fd',
  client: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  connection: '4f1206a1-fec7-491f-beed-662d9e9fc904',
  actor: '10ea5019-e05f-476f-971e-a73a3bc6930c'
}

function normalizedConfig(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    briefId: ids.brief,
    briefVersion: 3,
    tenantId: ids.tenant,
    clientId: ids.client,
    connectionId: ids.connection,
    customerId: '1234567890',
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
    merchantCenterId: '5831245452',
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
      imageAssetResourceNames: ['customers/1234567890/assets/10'],
      logoAssetResourceNames: ['customers/1234567890/assets/20'],
      youtubeVideoAssetResourceNames: []
    },
    conversionGoals: [{
      conversionActionId: '111',
      resourceName: 'customers/1234567890/conversionActions/111',
      category: 'SUBMIT_LEAD_FORM',
      origin: 'WEBSITE'
    }],
    approval: { required: true, complianceAcknowledged: true },
    ...overrides
  }
}

function storedLaunch(overrides: Record<string, unknown> = {}) {
  return {
    id: launchId,
    tenantId: ids.tenant,
    clientId: ids.client,
    briefId: ids.brief,
    configVersion: 3,
    configHash: 'a'.repeat(64),
    state: 'READY_FOR_APPROVAL',
    normalizedConfig: normalizedConfig(),
    ...overrides
  }
}

describe('Google PMax launch API boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    query = {}
    body = {}
    launchId = '5c4ca47b-df3a-43cd-b82f-a23a3f03a781'
    mockRequirePermission.mockResolvedValue({ id: ids.actor, role: 'owner' })
    mockGetSelectedTenant.mockResolvedValue(ids.tenant)
    mockHasRole.mockReturnValue(true)
    mockListLaunches.mockResolvedValue([storedLaunch()])
    mockGetLaunch.mockResolvedValue(storedLaunch())
    mockCreateLaunch.mockResolvedValue({ launch: storedLaunch({ state: 'DRAFT' }), isReplay: false })
    mockApproveLaunch.mockResolvedValue(storedLaunch({ state: 'APPROVED' }))
    mockGetOnboardingAttestation.mockResolvedValue(null)
    mockCreateOnboardingAttestation.mockResolvedValue({
      attestation: { id: '9f6aca34-2ed4-4547-8e60-a3631e6d316e', active: true },
      isReplay: false
    })
    mockQueryOne.mockResolvedValue({
      id: ids.brief,
      client_id: ids.client,
      status: 'approved',
      launch_config_version: 3,
      template_slug: 'google-pmax',
      connection_id: ids.connection
    })
  })

  it('requires all-client access before listing an unfiltered tenant launch set', async () => {
    const handler = (await import('~~/server/api/agency/social/google/pmax-launches/index.get')).default

    const result = await handler({ context: {} } as never)

    expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), 'MEDIA_BUYING')
    expect(mockRequireAllSocialClientAccess).toHaveBeenCalledOnce()
    expect(mockRequireSocialClientAccess).not.toHaveBeenCalled()
    expect(mockListLaunches).toHaveBeenCalledWith({ tenantId: ids.tenant, clientId: undefined, limit: 50 })
    expect(result.permissions).toEqual({ canApprove: true })
  })

  it('enforces assignment scope when listing one client', async () => {
    query = { clientId: ids.client, limit: '10' }
    const handler = (await import('~~/server/api/agency/social/google/pmax-launches/index.get')).default

    await handler({ context: {} } as never)

    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), ids.client)
    expect(mockRequireAllSocialClientAccess).not.toHaveBeenCalled()
    expect(mockListLaunches).toHaveBeenCalledWith({ tenantId: ids.tenant, clientId: ids.client, limit: 10 })
  })

  it('creates only from the current approved Google PMax brief version', async () => {
    const config = normalizedConfig()
    body = { normalizedConfig: config }
    const handler = (await import('~~/server/api/agency/social/google/pmax-launches/index.post')).default

    const result = await handler({ context: {} } as never)

    const configHash = hashCanonicalLaunchJson(config)
    const idempotencyKey = hashCanonicalLaunchJson({
      tenantId: ids.tenant,
      briefId: ids.brief,
      configVersion: 3,
      configHash
    })
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), ids.client)
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining(`sc.platform = 'google'`), [
      ids.brief,
      ids.client,
      ids.connection,
      '1234567890',
      ids.tenant
    ])
    expect(mockCreateLaunch).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: ids.tenant,
      briefId: ids.brief,
      configVersion: 3,
      configHash,
      idempotencyKey,
      actorId: ids.actor
    }))
    expect(result.isReplay).toBe(false)
  })

  it('rejects stale brief evidence before opening a launch plan', async () => {
    body = { normalizedConfig: normalizedConfig() }
    mockQueryOne.mockResolvedValue({
      id: ids.brief,
      client_id: ids.client,
      status: 'approved',
      launch_config_version: 4,
      template_slug: 'google-pmax',
      connection_id: ids.connection
    })
    const handler = (await import('~~/server/api/agency/social/google/pmax-launches/index.post')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(mockCreateLaunch).not.toHaveBeenCalled()
  })

  it('rejects caller-selected idempotency evidence', async () => {
    body = { normalizedConfig: normalizedConfig(), idempotencyKey: 'f'.repeat(64) }
    const handler = (await import('~~/server/api/agency/social/google/pmax-launches/index.post')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Idempotency key does not match this launch plan'
    })
    expect(mockCreateLaunch).not.toHaveBeenCalled()
  })

  it('loads a tenant-scoped launch before enforcing client access', async () => {
    const handler = (await import('~~/server/api/agency/social/google/pmax-launches/[id]/index.get')).default

    const result = await handler({ context: {} } as never)

    expect(mockGetLaunch).toHaveBeenCalledWith({ launchId, tenantId: ids.tenant })
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), ids.client)
    expect(result.launch.id).toBe(launchId)
  })

  it('requires a separate admin approval bound to the exact config version and hash', async () => {
    body = {
      approvalKind: 'create',
      expectedConfigVersion: 3,
      expectedConfigHash: 'a'.repeat(64),
      reason: 'Approved after reviewing the complete preflight evidence.'
    }
    const handler = (await import('~~/server/api/agency/social/google/pmax-launches/[id]/approve.post')).default

    const result = await handler({ context: {} } as never)

    expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), 'ADMIN')
    expect(mockGetLaunch).toHaveBeenCalledWith({ launchId, tenantId: ids.tenant })
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), ids.client)
    expect(mockApproveLaunch).toHaveBeenCalledWith({
      launchId,
      tenantId: ids.tenant,
      actorId: ids.actor,
      ...body
    })
    expect(result.launch.state).toBe('APPROVED')
  })

  it('normalizes stale approval evidence to an HTTP conflict', async () => {
    body = {
      approvalKind: 'activate',
      expectedConfigVersion: 3,
      expectedConfigHash: 'a'.repeat(64),
      reason: 'Approved after independently verifying the campaign is paused.'
    }
    mockApproveLaunch.mockRejectedValue(new GooglePmaxLaunchConflictError(
      'LAUNCH_APPROVAL_CONFLICT',
      'Approval is stale or invalid for the current launch state.'
    ))
    const handler = (await import('~~/server/api/agency/social/google/pmax-launches/[id]/approve.post')).default

    await expect(handler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Approval is stale or invalid for the current launch state.'
    })
  })

  it('returns the latest expired onboarding attestation when no active evidence remains', async () => {
    const expired = { id: '9f6aca34-2ed4-4547-8e60-a3631e6d316e', active: false }
    mockGetOnboardingAttestation.mockResolvedValueOnce(null).mockResolvedValueOnce(expired)
    const handler = (await import('~~/server/api/agency/social/google/pmax-launches/[id]/onboarding.get')).default

    const result = await handler({ context: {} } as never)

    expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), 'MEDIA_BUYING')
    expect(mockGetOnboardingAttestation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      launchId,
      tenantId: ids.tenant
    }))
    expect(mockGetOnboardingAttestation).toHaveBeenNthCalledWith(2, expect.objectContaining({ activeOnly: false }))
    expect(result).toEqual({ attestation: expired, active: false })
  })

  it('allows only an admin to attest onboarding facts against the stored config', async () => {
    const onboardingEvidence = { countryCode: 'AU' }
    body = {
      evidence: onboardingEvidence,
      reason: 'Verified against Google admin surfaces and client evidence.'
    }
    const handler = (await import('~~/server/api/agency/social/google/pmax-launches/[id]/onboarding.post')).default

    const result = await handler({ context: {} } as never)

    expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), 'ADMIN')
    expect(mockRequireSocialClientAccess).toHaveBeenCalledWith(expect.anything(), ids.client)
    expect(mockCreateOnboardingAttestation).toHaveBeenCalledWith(expect.objectContaining({
      launchId,
      tenantId: ids.tenant,
      actorId: ids.actor,
      configVersion: 3,
      configHash: 'a'.repeat(64),
      evidence: onboardingEvidence,
      reason: body.reason
    }))
    expect(result.isReplay).toBe(false)
  })
})
