import { describe, expect, it, vi } from 'vitest'
import type { MeasurementError } from '../../../../server/utils/measurement/errors'
import type {
  MeasurementProfile,
  MeasurementProfileRepository,
  PersistProfileUpdate
} from '../../../../server/utils/measurement/profileRepository'
import {
  createMeasurementProfileService,
  type MeasurementProfileCacheProjection
} from '../../../../server/utils/measurement/profileService'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const TRACKING_SITE_ID = '55555555-5555-4555-8555-555555555555'

function baseProfile(): MeasurementProfile {
  return {
    id: PROFILE_ID,
    clientId: CLIENT_ID,
    desiredEnabled: true,
    desiredStateSource: 'existing_review',
    enabled: false,
    environment: 'test',
    collectionTier: 'backend_only',
    trackingSiteId: null,
    firstPartyHostname: null,
    hostnameStatus: 'not_required',
    consentMode: 'consent_gated',
    vertical: 'automotive',
    outcomeAuthority: 'zero_native',
    nativeLifecycleMode: 'crm_preferred',
    portalOutcomeMode: 'disabled',
    configVersion: 1,
    cacheStatus: 'not_published',
    cacheVersion: null,
    cacheErrorClass: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z'
  }
}

function harness(options: {
  cacheFailure?: boolean
  cacheStatusFailure?: boolean
  cacheStatusRejected?: boolean
  concurrentNewerVersion?: boolean
} = {}) {
  let profile = baseProfile()
  const operations: string[] = []
  const audits: PersistProfileUpdate[] = []

  const repository: MeasurementProfileRepository = {
    getByClientId: vi.fn(async clientId => clientId === profile.clientId ? { ...profile } : null),
    update: vi.fn(async (input) => {
      operations.push('repository:update')
      if (input.clientId !== profile.clientId) return { status: 'not_found' as const }
      if (input.expectedVersion !== profile.configVersion) {
        return { status: 'version_conflict' as const, currentVersion: profile.configVersion }
      }

      profile = {
        ...input.nextProfile,
        cacheStatus: 'not_published',
        cacheVersion: null,
        cacheErrorClass: null,
        updatedAt: '2026-07-17T01:00:00.000Z'
      }
      audits.push(input)
      return { status: 'updated' as const, profile: { ...profile } }
    }),
    recordCachePublication: vi.fn(async (input) => {
      operations.push(`repository:cache:${input.status}`)
      if (options.cacheStatusFailure) throw new Error('database unavailable')
      if (input.clientId === profile.clientId && input.configVersion === profile.configVersion) {
        profile = {
          ...profile,
          cacheStatus: input.status,
          cacheVersion: input.status === 'fresh' ? input.configVersion : null,
          cacheErrorClass: input.errorClass
        }
        return !options.cacheStatusRejected
      }
      return false
    })
  }

  const cache = {
    publish: vi.fn(async (_projection: MeasurementProfileCacheProjection) => {
      operations.push('cache:publish')
      if (options.cacheFailure) throw new Error('KV unavailable with secret details')
      if (options.concurrentNewerVersion && cache.publish.mock.calls.length === 1) {
        profile = {
          ...profile,
          consentMode: 'off',
          configVersion: profile.configVersion + 1,
          cacheStatus: 'not_published',
          cacheVersion: null,
          cacheErrorClass: null
        }
      }
    })
  }

  return {
    repository,
    cache,
    operations,
    audits,
    service: createMeasurementProfileService({ repository, cache })
  }
}

describe('Measurement profile service', () => {
  it('requests on-demand profile creation when opening measurement for a client', async () => {
    const test = harness()

    await expect(test.service.get(CLIENT_ID)).resolves.toMatchObject({
      clientId: CLIENT_ID,
      desiredEnabled: true,
      desiredStateSource: 'existing_review',
      enabled: false,
      environment: 'test'
    })

    expect(test.repository.getByClientId).toHaveBeenCalledWith(
      CLIENT_ID,
      { createIfMissing: true }
    )
  })

  it('records an explicit client opt-out without changing runtime delivery state', async () => {
    const test = harness()

    const result = await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Client requested measurement signals be turned off',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: { desiredEnabled: false }
    })

    expect(result.profile).toMatchObject({
      desiredEnabled: false,
      desiredStateSource: 'explicit_opt_out',
      enabled: false,
      environment: 'test'
    })
    expect(test.audits[0]?.changedFields).toEqual(['desiredEnabled', 'desiredStateSource'])
  })

  it('records an operator opt-in while keeping live activation gated', async () => {
    const test = harness()
    await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Record client opt-out',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: { desiredEnabled: false }
    })

    const result = await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 2,
      reason: 'Client requested measurement signals be restored',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: { desiredEnabled: true }
    })

    expect(result.profile).toMatchObject({
      desiredEnabled: true,
      desiredStateSource: 'operator',
      enabled: false,
      environment: 'test'
    })
  })

  it('atomically versions and audits a tenant-scoped profile before publishing cache', async () => {
    const test = harness()

    const result = await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Prepare first-party collection in test mode',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: {
        collectionTier: 'first_party_cname',
        trackingSiteId: TRACKING_SITE_ID,
        firstPartyHostname: 'track.example.com'
      }
    })

    expect(result.profile).toMatchObject({
      clientId: CLIENT_ID,
      collectionTier: 'first_party_cname',
      trackingSiteId: TRACKING_SITE_ID,
      firstPartyHostname: 'track.example.com',
      hostnameStatus: 'pending',
      configVersion: 2,
      cacheStatus: 'fresh',
      cacheVersion: 2
    })
    expect(result.warnings).toEqual([])
    expect(test.operations).toEqual([
      'repository:update',
      'cache:publish',
      'repository:cache:fresh'
    ])
    expect(test.audits).toHaveLength(1)
    expect(test.audits[0]).toMatchObject({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      changedFields: ['collectionTier', 'trackingSiteId', 'firstPartyHostname', 'hostnameStatus']
    })
  })

  it('rejects an operator-supplied hostname readiness claim', async () => {
    const test = harness()

    await expect(test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Attempt to bypass provider verification',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: {
        collectionTier: 'first_party_cname',
        trackingSiteId: TRACKING_SITE_ID,
        firstPartyHostname: 'track.example.com',
        hostnameStatus: 'active'
      }
    } as never)).rejects.toMatchObject({
      code: 'MEASUREMENT_VALIDATION_ERROR',
      statusCode: 422
    })

    expect(test.repository.update).not.toHaveBeenCalled()
  })

  it('clears hostname state when leaving first-party collection', async () => {
    const test = harness()
    await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Prepare verified first-party collection',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: {
        collectionTier: 'first_party_cname',
        trackingSiteId: TRACKING_SITE_ID,
        firstPartyHostname: 'track.example.com'
      }
    })

    const result = await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 2,
      reason: 'Exercise the shared-endpoint rollback',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: { collectionTier: 'shared_endpoint' }
    })

    expect(result.profile).toMatchObject({
      collectionTier: 'shared_endpoint',
      firstPartyHostname: null,
      hostnameStatus: 'not_required'
    })
  })

  it('does not restart hostname verification for an unrelated profile update', async () => {
    const test = harness()
    await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Prepare first-party collection',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: {
        collectionTier: 'first_party_cname',
        trackingSiteId: TRACKING_SITE_ID,
        firstPartyHostname: 'track.example.com'
      }
    })

    const result = await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 2,
      reason: 'Update consent policy without changing transport',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: { consentMode: 'au_optout' }
    })

    expect(result.profile).toMatchObject({
      collectionTier: 'first_party_cname',
      firstPartyHostname: 'track.example.com',
      hostnameStatus: 'pending',
      consentMode: 'au_optout'
    })
    expect(test.audits[1]?.changedFields).toEqual(['consentMode'])
  })

  it('returns a stable conflict without publishing when the expected version is stale', async () => {
    const test = harness()

    await expect(test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 9,
      reason: 'Stale editor update',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: { consentMode: 'au_optout' }
    })).rejects.toMatchObject({
      code: 'MEASUREMENT_VERSION_CONFLICT',
      statusCode: 409
    } satisfies Partial<MeasurementError>)

    expect(test.cache.publish).not.toHaveBeenCalled()
    expect(test.audits).toEqual([])
  })

  it('does not reveal whether a profile belongs to a different client', async () => {
    const test = harness()

    await expect(test.service.get('44444444-4444-4444-8444-444444444444'))
      .rejects.toMatchObject({ code: 'MEASUREMENT_NOT_FOUND', statusCode: 404 })
  })

  it('fails closed on live enablement until the dedicated approval gate exists', async () => {
    const test = harness()

    await expect(test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Attempt live activation',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: { enabled: true, environment: 'live' }
    })).rejects.toMatchObject({
      code: 'MEASUREMENT_DISABLED',
      statusCode: 409
    })

    expect(test.repository.update).not.toHaveBeenCalled()
  })

  it('rejects authoritative portal outcomes when an external system owns lifecycle truth', async () => {
    const test = harness()

    await expect(test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Configure external CRM authority',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: {
        outcomeAuthority: 'client_webhook',
        portalOutcomeMode: 'authoritative'
      }
    })).rejects.toMatchObject({ code: 'MEASUREMENT_VALIDATION_ERROR', statusCode: 422 })
  })

  it('rejects unknown or secret-bearing fields at the service boundary', async () => {
    const test = harness()

    await expect(test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Invalid secret-bearing request',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: {
        vertical: 'automotive',
        accessToken: 'must-not-enter-profile-config'
      }
    } as never)).rejects.toMatchObject({
      code: 'MEASUREMENT_VALIDATION_ERROR',
      statusCode: 422
    })

    expect(test.repository.update).not.toHaveBeenCalled()
  })

  it('keeps committed Neon truth and returns a redacted warning when cache publication fails', async () => {
    const test = harness({ cacheFailure: true })

    const result = await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Change consent policy in test mode',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: { consentMode: 'au_optout' }
    })

    expect(result.profile).toMatchObject({
      consentMode: 'au_optout',
      configVersion: 2,
      cacheStatus: 'stale',
      cacheErrorClass: 'cache_publication_failed'
    })
    expect(result.warnings).toEqual([{ code: 'MEASUREMENT_CACHE_STALE' }])
    expect(JSON.stringify(result)).not.toContain('KV unavailable with secret details')
  })

  it('publishes only the edge allowlist and no lifecycle or operator fields', async () => {
    const test = harness()

    await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Prepare shared endpoint',
      actor: { type: 'team_member', id: '33333333-3333-4333-8333-333333333333' },
      patch: { collectionTier: 'shared_endpoint' }
    })

    expect(test.cache.publish).toHaveBeenCalledWith({
      profileId: PROFILE_ID,
      clientId: CLIENT_ID,
      enabled: false,
      environment: 'test',
      collectionTier: 'shared_endpoint',
      trackingSiteId: null,
      firstPartyHostname: null,
      hostnameStatus: 'not_required',
      consentMode: 'consent_gated',
      configVersion: 2
    })
  })

  it('does not turn a cache-health write failure into a failed canonical update', async () => {
    const test = harness({ cacheFailure: true, cacheStatusFailure: true })

    const result = await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Prepare backend-only collection',
      actor: { type: 'system', id: 'measurement-bootstrap' },
      patch: { vertical: 'automotive-retail' }
    })

    expect(result.profile).toMatchObject({ vertical: 'automotive-retail', configVersion: 2 })
    expect(result.warnings).toEqual([{ code: 'MEASUREMENT_CACHE_STALE' }])
  })

  it('does not report cache freshness when a newer profile version rejects the health write', async () => {
    const test = harness({ cacheStatusRejected: true })

    const result = await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Prepare shared test collection',
      actor: { type: 'system', id: 'measurement-bootstrap' },
      patch: { collectionTier: 'shared_endpoint' }
    })

    expect(result.profile).toMatchObject({
      configVersion: 2,
      cacheStatus: 'not_published',
      cacheVersion: null
    })
    expect(result.warnings).toEqual([{ code: 'MEASUREMENT_CACHE_STALE' }])
  })

  it('returns one cache warning when publication and exact-version health recording both fail', async () => {
    const test = harness({ cacheFailure: true, cacheStatusRejected: true })

    const result = await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Prepare a dormant test profile',
      actor: { type: 'system', id: 'measurement-bootstrap' },
      patch: { vertical: 'automotive-retail' }
    })

    expect(result.warnings).toEqual([{ code: 'MEASUREMENT_CACHE_STALE' }])
  })

  it('repairs cache from Neon when a newer profile wins during publication', async () => {
    const test = harness({ concurrentNewerVersion: true })

    const result = await test.service.update({
      clientId: CLIENT_ID,
      expectedVersion: 1,
      reason: 'Prepare shared test collection',
      actor: { type: 'system', id: 'measurement-bootstrap' },
      patch: { collectionTier: 'shared_endpoint' }
    })

    expect(test.cache.publish).toHaveBeenCalledTimes(2)
    expect(test.cache.publish.mock.calls.map(([value]) => value.configVersion)).toEqual([2, 3])
    expect(test.repository.recordCachePublication).toHaveBeenLastCalledWith(expect.objectContaining({
      configVersion: 3,
      status: 'fresh'
    }))
    expect(result.warnings).toEqual([{ code: 'MEASUREMENT_CACHE_STALE' }])
  })
})
