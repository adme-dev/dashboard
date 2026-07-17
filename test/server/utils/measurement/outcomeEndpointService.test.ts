import { describe, expect, it, vi } from 'vitest'
import type {
  MeasurementOutcomeEndpointRepository
} from '../../../../server/utils/measurement/outcomeEndpointRepository'
import type {
  MeasurementProfileRepository
} from '../../../../server/utils/measurement/profileRepository'
import { createMeasurementOutcomeEndpointService } from '../../../../server/utils/measurement/outcomeEndpointService'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const ENDPOINT_KEY = 'a'.repeat(43)

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
    outcomeAuthority: 'client_webhook' as const,
    nativeLifecycleMode: 'leads_only' as const,
    portalOutcomeMode: 'disabled' as const,
    configVersion: 5,
    cacheStatus: 'not_published' as const,
    cacheVersion: null,
    cacheErrorClass: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T07:00:00.000Z'
  }
}

function endpoint() {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    clientId: CLIENT_ID,
    profileId: PROFILE_ID,
    endpointKey: ENDPOINT_KEY,
    label: 'Dealer CRM',
    sourceSystem: 'dealer_crm',
    secretConfigured: true,
    secretVersion: 1,
    status: 'disabled' as const,
    replayWindowSeconds: 300,
    rateLimitPerMinute: 60,
    configVersion: 5,
    lastReceivedAt: null,
    createdAt: '2026-07-17T07:00:00.000Z',
    updatedAt: '2026-07-17T07:00:00.000Z'
  }
}

function input() {
  return {
    clientId: CLIENT_ID,
    expectedProfileVersion: 4,
    actor: { type: 'team_member' as const, id: '33333333-3333-4333-8333-333333333333' },
    reason: 'Prepare external CRM outcomes in test mode',
    endpoint: {
      label: 'Dealer CRM',
      sourceSystem: 'dealer_crm',
      currentSecretRef: 'cloudflare/measurement/outcomes/dealer-crm-v1',
      replayWindowSeconds: 300,
      rateLimitPerMinute: 60
    }
  }
}

function harness(options: {
  createStatus?: 'created' | 'not_found' | 'not_available' | 'duplicate' | 'version_conflict'
  cacheFailure?: boolean
} = {}) {
  const createStatus = options.createStatus ?? 'created'
  const repository: MeasurementOutcomeEndpointRepository = {
    list: vi.fn(async () => ({
      items: [endpoint()],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 }
    })),
    create: vi.fn(async () => {
      if (createStatus === 'created') {
        return { status: 'created' as const, profile: profile(), endpoint: endpoint() }
      }
      if (createStatus === 'version_conflict') {
        return { status: 'version_conflict' as const, currentVersion: 5 }
      }
      return { status: createStatus }
    })
  }
  const profileRepository: MeasurementProfileRepository = {
    getByClientId: vi.fn(async () => profile()),
    update: vi.fn(),
    recordCachePublication: vi.fn(async () => true)
  }
  const cache = {
    publish: vi.fn(async () => {
      if (options.cacheFailure) throw new Error('KV internal details')
    })
  }
  return {
    repository,
    profileRepository,
    cache,
    service: createMeasurementOutcomeEndpointService({
      repository,
      profileRepository,
      cache,
      generateEndpointKey: () => ENDPOINT_KEY
    })
  }
}

describe('Measurement outcome endpoint service', () => {
  it('generates endpoint identity server-side and publishes the new profile version', async () => {
    const test = harness()

    const result = await test.service.create(input())

    expect(result).toEqual({ endpoint: endpoint(), profileConfigVersion: 5, warnings: [] })
    expect(test.repository.create).toHaveBeenCalledWith({ ...input(), endpointKey: ENDPOINT_KEY })
    expect(test.cache.publish).toHaveBeenCalledWith(expect.objectContaining({ configVersion: 5 }))
  })

  it('rejects raw secret and endpoint-key fields before persistence', async () => {
    const test = harness()

    await expect(test.service.create({
      ...input(),
      endpointKey: 'client-key',
      endpoint: { ...input().endpoint, webhookSecret: 'raw-secret' }
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR', statusCode: 422 })
    expect(test.repository.create).not.toHaveBeenCalled()
  })

  it('keeps Neon canonical and returns a redacted warning when cache publication fails', async () => {
    const test = harness({ cacheFailure: true })

    const result = await test.service.create(input())

    expect(result.endpoint.id).toBe(endpoint().id)
    expect(result.warnings).toEqual([{ code: 'MEASUREMENT_CACHE_STALE' }])
    expect(JSON.stringify(result)).not.toContain('KV internal details')
  })
})
