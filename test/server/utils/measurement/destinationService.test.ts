import { describe, expect, it, vi } from 'vitest'
import type { MeasurementDestinationRepository } from '../../../../server/utils/measurement/destinationRepository'
import type { MeasurementProfileRepository } from '../../../../server/utils/measurement/profileRepository'
import { createMeasurementDestinationService } from '../../../../server/utils/measurement/destinationService'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const DESTINATION_ID = '55555555-5555-4555-8555-555555555555'

function profile() {
  return {
    id: PROFILE_ID,
    clientId: CLIENT_ID,
    enabled: false,
    environment: 'test' as const,
    collectionTier: 'backend_only' as const,
    trackingSiteId: null,
    firstPartyHostname: null,
    hostnameStatus: 'not_required' as const,
    consentMode: 'consent_gated' as const,
    vertical: 'automotive',
    outcomeAuthority: 'zero_native' as const,
    nativeLifecycleMode: 'crm_preferred' as const,
    portalOutcomeMode: 'disabled' as const,
    configVersion: 2,
    cacheStatus: 'not_published' as const,
    cacheVersion: null,
    cacheErrorClass: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T01:00:00.000Z'
  }
}

function destination() {
  return {
    id: DESTINATION_ID,
    clientId: CLIENT_ID,
    profileId: PROFILE_ID,
    platform: 'meta' as const,
    socialConnectionId: null,
    externalDestinationId: '573284833843027',
    credentialConfigured: true,
    enabled: false,
    environment: 'test' as const,
    healthStatus: 'configured' as const,
    configVersion: 2,
    lastValidatedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    providerRequestId: null,
    errorClass: null,
    redactedError: null,
    capabilities: [],
    mappings: [],
    createdAt: '2026-07-17T01:00:00.000Z',
    updatedAt: '2026-07-17T01:00:00.000Z'
  }
}

function createInput() {
  return {
    clientId: CLIENT_ID,
    expectedProfileVersion: 1,
    reason: 'Configure Meta CRM delivery in test mode',
    actor: { type: 'team_member' as const, id: '33333333-3333-4333-8333-333333333333' },
    destination: {
      platform: 'meta' as const,
      socialConnectionId: null,
      externalDestinationId: '573284833843027',
      credentialRef: 'cloudflare/measurement/meta/ferntree',
      capabilities: [{
        mode: 'meta_crm_capi' as const,
        status: 'configured' as const,
        managementOrigin: 'zero' as const,
        canZeroMutate: true,
        blockingReason: null
      }],
      mappings: [{
        canonicalEventName: 'lead_qualified' as const,
        providerEventName: 'QualifiedLead',
        isActive: true
      }]
    }
  }
}

function harness(options: {
  createStatus?: 'created' | 'not_found' | 'connection_not_found' | 'version_conflict' | 'duplicate'
  cacheFailure?: boolean
  cacheStatusRejected?: boolean
} = {}) {
  const createStatus = options.createStatus ?? 'created'
  const repository: MeasurementDestinationRepository = {
    list: vi.fn(async () => ({
      items: [destination()],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 }
    })),
    create: vi.fn(async () => {
      if (createStatus === 'created') {
        return { status: 'created' as const, profile: profile(), destination: destination() }
      }
      if (createStatus === 'version_conflict') {
        return { status: 'version_conflict' as const, currentVersion: 2 }
      }
      return { status: createStatus }
    })
  }
  const profileRepository: MeasurementProfileRepository = {
    getByClientId: vi.fn(async () => ({ ...profile(), configVersion: 3 })),
    update: vi.fn(),
    recordCachePublication: vi.fn()
      .mockResolvedValueOnce(!options.cacheStatusRejected)
      .mockResolvedValue(true)
  }
  const cache = {
    publish: vi.fn(async () => {
      if (options.cacheFailure) throw new Error('KV failure with internal details')
    })
  }

  return {
    repository,
    profileRepository,
    cache,
    service: createMeasurementDestinationService({ repository, profileRepository, cache })
  }
}

describe('Measurement destination service', () => {
  it('lists only validated tenant-scoped pagination input', async () => {
    const test = harness()

    const result = await test.service.list({
      clientId: CLIENT_ID,
      page: '1',
      pageSize: '25',
      platform: 'meta'
    })

    expect(result.items).toHaveLength(1)
    expect(test.repository.list).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      page: 1,
      pageSize: 25,
      platform: 'meta'
    })
  })

  it('publishes the new profile version only after canonical destination creation', async () => {
    const test = harness()

    const result = await test.service.create(createInput())

    expect(result).toEqual({
      destination: destination(),
      profileConfigVersion: 2,
      warnings: []
    })
    expect(test.cache.publish).toHaveBeenCalledWith(expect.objectContaining({
      clientId: CLIENT_ID,
      configVersion: 2
    }))
    expect(test.profileRepository.recordCachePublication).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      profileId: PROFILE_ID,
      configVersion: 2,
      status: 'fresh',
      errorClass: null
    })
  })

  it('keeps the committed destination and returns a redacted warning when cache publication fails', async () => {
    const test = harness({ cacheFailure: true })

    const result = await test.service.create(createInput())

    expect(result.destination.id).toBe(DESTINATION_ID)
    expect(result.warnings).toEqual([{ code: 'MEASUREMENT_CACHE_STALE' }])
    expect(test.profileRepository.recordCachePublication).toHaveBeenCalledWith(expect.objectContaining({
      status: 'stale',
      errorClass: 'cache_publication_failed'
    }))
    expect(JSON.stringify(result)).not.toContain('internal details')
  })

  it('repairs cache from the latest canonical profile when a newer version rejects health recording', async () => {
    const test = harness({ cacheStatusRejected: true })

    const result = await test.service.create(createInput())

    expect(test.cache.publish).toHaveBeenCalledTimes(2)
    expect(test.cache.publish.mock.calls.map(([value]) => value.configVersion)).toEqual([2, 3])
    expect(test.profileRepository.recordCachePublication).toHaveBeenLastCalledWith(expect.objectContaining({
      configVersion: 3,
      status: 'fresh'
    }))
    expect(result.warnings).toEqual([{ code: 'MEASUREMENT_CACHE_STALE' }])
  })

  it.each([
    ['not_found', 'MEASUREMENT_NOT_FOUND', 404],
    ['connection_not_found', 'MEASUREMENT_NOT_FOUND', 404],
    ['version_conflict', 'MEASUREMENT_VERSION_CONFLICT', 409],
    ['duplicate', 'MEASUREMENT_DUPLICATE', 409]
  ] as const)('maps repository %s to a stable service error', async (createStatus, code, statusCode) => {
    const test = harness({ createStatus })

    await expect(test.service.create(createInput())).rejects.toMatchObject({ code, statusCode })
    expect(test.cache.publish).not.toHaveBeenCalled()
  })

  it('rejects unknown secret-bearing fields before reaching the repository', async () => {
    const test = harness()

    await expect(test.service.create({
      ...createInput(),
      destination: {
        ...createInput().destination,
        accessToken: 'must-not-reach-persistence'
      }
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR', statusCode: 422 })
    expect(test.repository.create).not.toHaveBeenCalled()
  })
})
