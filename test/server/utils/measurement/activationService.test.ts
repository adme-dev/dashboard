import { describe, expect, it, vi } from 'vitest'
import type {
  MeasurementActivationRepository
} from '../../../../server/utils/measurement/activationRepository'
import type {
  MeasurementProfileRepository
} from '../../../../server/utils/measurement/profileRepository'
import { createMeasurementActivationService } from '../../../../server/utils/measurement/activationService'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'

function activatedProfile() {
  return {
    id: PROFILE_ID,
    clientId: CLIENT_ID,
    enabled: true,
    environment: 'live' as const,
    collectionTier: 'backend_only' as const,
    trackingSiteId: null,
    firstPartyHostname: null,
    hostnameStatus: 'not_required' as const,
    consentMode: 'consent_gated' as const,
    vertical: 'automotive',
    outcomeAuthority: 'zero_native' as const,
    nativeLifecycleMode: 'crm_preferred' as const,
    portalOutcomeMode: 'disabled' as const,
    configVersion: 4,
    cacheStatus: 'not_published' as const,
    cacheVersion: null,
    cacheErrorClass: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T06:00:00.000Z'
  }
}

function harness(options: {
  approveStatus?: 'approved' | 'not_found' | 'not_available' | 'duplicate_approval' | 'approver_conflict' | 'version_conflict'
  activateStatus?: 'activated' | 'not_found' | 'already_active' | 'not_ready' | 'version_conflict'
  cacheFailure?: boolean
} = {}) {
  const approveStatus = options.approveStatus ?? 'approved'
  const activateStatus = options.activateStatus ?? 'activated'
  const repository: MeasurementActivationRepository = {
    approve: vi.fn(async () => {
      if (approveStatus === 'approved') {
        return {
          status: 'approved' as const,
          approval: {
            id: '55555555-5555-4555-8555-555555555555',
            clientId: CLIENT_ID,
            profileId: PROFILE_ID,
            configVersion: 3,
            approvalKind: 'privacy' as const,
            approvedBy: ACTOR_ID,
            reason: 'Consent reviewed',
            createdAt: '2026-07-17T06:00:00.000Z'
          }
        }
      }
      if (approveStatus === 'version_conflict') {
        return { status: 'version_conflict' as const, currentVersion: 4 }
      }
      return { status: approveStatus }
    }),
    activate: vi.fn(async () => {
      if (activateStatus === 'activated') {
        return {
          status: 'activated' as const,
          profile: activatedProfile(),
          activatedDestinations: 1
        }
      }
      if (activateStatus === 'not_ready') {
        return {
          status: 'not_ready' as const,
          blockers: ['capability_not_ready' as const]
        }
      }
      if (activateStatus === 'version_conflict') {
        return { status: 'version_conflict' as const, currentVersion: 4 }
      }
      return { status: activateStatus }
    })
  }
  const profileRepository: MeasurementProfileRepository = {
    getByClientId: vi.fn(async () => activatedProfile()),
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
    service: createMeasurementActivationService({ repository, profileRepository, cache })
  }
}

describe('Measurement activation service', () => {
  it('records an authenticated approval without publishing configuration', async () => {
    const test = harness()

    const approval = await test.service.approve({
      clientId: CLIENT_ID,
      expectedConfigVersion: 3,
      approvalKind: 'privacy',
      actor: { type: 'team_member', id: ACTOR_ID },
      reason: 'Consent reviewed'
    })

    expect(approval.approvalKind).toBe('privacy')
    expect(test.cache.publish).not.toHaveBeenCalled()
  })

  it('publishes the activated canonical profile only after the transaction commits', async () => {
    const test = harness()

    const result = await test.service.activate({
      clientId: CLIENT_ID,
      expectedConfigVersion: 3,
      actor: { type: 'team_member', id: ACTOR_ID },
      reason: 'All gates passed'
    })

    expect(result).toEqual({
      profile: activatedProfile(),
      activatedDestinations: 1,
      warnings: []
    })
    expect(test.cache.publish).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      environment: 'live',
      configVersion: 4
    }))
  })

  it('keeps activation canonical and warns when cache publication fails', async () => {
    const test = harness({ cacheFailure: true })

    const result = await test.service.activate({
      clientId: CLIENT_ID,
      expectedConfigVersion: 3,
      actor: { type: 'team_member', id: ACTOR_ID },
      reason: 'All gates passed'
    })

    expect(result.profile.enabled).toBe(true)
    expect(result.warnings).toEqual([{ code: 'MEASUREMENT_CACHE_STALE' }])
    expect(JSON.stringify(result)).not.toContain('KV internal details')
  })

  it('returns safe readiness blocker codes when activation is not eligible', async () => {
    const test = harness({ activateStatus: 'not_ready' })

    await expect(test.service.activate({
      clientId: CLIENT_ID,
      expectedConfigVersion: 3,
      actor: { type: 'team_member', id: ACTOR_ID },
      reason: 'Attempt activation'
    })).rejects.toMatchObject({
      code: 'MEASUREMENT_NOT_READY',
      statusCode: 409,
      details: { blockers: ['capability_not_ready'] }
    })
    expect(test.cache.publish).not.toHaveBeenCalled()
  })
})
