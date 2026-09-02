import { describe, expect, it, vi } from 'vitest'
import type {
  MeasurementReadinessEvidence,
  MeasurementReadRepository
} from '../../../../server/utils/measurement/readRepository'
import { createMeasurementReadService } from '../../../../server/utils/measurement/readService'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'

function evidence(overrides: Partial<MeasurementReadinessEvidence> = {}): MeasurementReadinessEvidence {
  return {
    clientId: CLIENT_ID,
    profileId: PROFILE_ID,
    configVersion: 4,
    profile: {
      desiredEnabled: true,
      enabled: false,
      environment: 'test',
      cacheStatus: 'fresh',
      outcomeAuthority: 'zero_native'
    },
    liveApproved: false,
    privacyApproved: false,
    counts: {
      destinations: 1,
      readyDestinations: 0,
      degradedDestinations: 0,
      blockedDestinations: 0,
      capabilities: 2,
      readyCapabilities: 0,
      degradedCapabilities: 0,
      blockedCapabilities: 0,
      activeMappings: 1,
      outcomeEndpoints: 0,
      readyOutcomeEndpoints: 0
    },
    lastValidatedAt: null,
    lastSuccessAt: null,
    ...overrides
  }
}

function harness(readiness: MeasurementReadinessEvidence | null = evidence()) {
  const repository: MeasurementReadRepository = {
    listAudit: vi.fn(async () => ({
      items: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 }
    })),
    getReadinessEvidence: vi.fn(async () => readiness)
  }
  return { repository, service: createMeasurementReadService({ repository }) }
}

describe('Measurement read service', () => {
  it('validates and coerces audit pagination before querying', async () => {
    const test = harness()

    await test.service.listAudit({
      clientId: CLIENT_ID,
      page: '1',
      pageSize: '25',
      entityType: 'profile'
    })

    expect(test.repository.listAudit).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      page: 1,
      pageSize: 25,
      entityType: 'profile'
    })
  })

  it('prioritizes blocked evidence and returns stable readiness blockers', async () => {
    const test = harness(evidence({
      profile: {
        desiredEnabled: true,
        enabled: false,
        environment: 'test',
        cacheStatus: 'stale',
        outcomeAuthority: 'zero_native'
      },
      counts: {
        ...evidence().counts,
        blockedDestinations: 1,
        blockedCapabilities: 1
      }
    }))

    const result = await test.service.getReadiness(CLIENT_ID)

    expect(result.status).toBe('blocked')
    expect(result.liveEligible).toBe(false)
    expect(result.approvals).toEqual({ privacy: false, live: false })
    expect(result.blockers.map(blocker => blocker.code)).toEqual(expect.arrayContaining([
      'cache_stale',
      'destination_not_ready',
      'capability_blocked',
      'live_approval_missing',
      'privacy_approval_missing'
    ]))
    expect(result.blockers.map(blocker => blocker.code)).not.toContain('activation_gate_unavailable')
  })

  it('keeps fully evidenced delivery separate from live activation eligibility', async () => {
    const test = harness(evidence({
      profile: {
        desiredEnabled: true,
        enabled: true,
        environment: 'live',
        cacheStatus: 'fresh',
        outcomeAuthority: 'zero_native'
      },
      liveApproved: true,
      privacyApproved: true,
      counts: {
        destinations: 1,
        readyDestinations: 1,
        degradedDestinations: 0,
        blockedDestinations: 0,
        capabilities: 2,
        readyCapabilities: 2,
        degradedCapabilities: 0,
        blockedCapabilities: 0,
        activeMappings: 1,
        outcomeEndpoints: 0,
        readyOutcomeEndpoints: 0
      },
      lastValidatedAt: '2026-07-17T02:00:00.000Z',
      lastSuccessAt: '2026-07-17T03:00:00.000Z'
    }))

    const result = await test.service.getReadiness(CLIENT_ID)

    expect(result.status).toBe('ready')
    expect(result.liveEligible).toBe(true)
    expect(result.approvals).toEqual({ privacy: true, live: true })
    expect(result.blockers).toEqual([])
  })

  it('does not reopen consumed approval gates after a profile is active', async () => {
    const test = harness(evidence({
      profile: {
        desiredEnabled: true,
        enabled: true,
        environment: 'live',
        cacheStatus: 'fresh',
        outcomeAuthority: 'zero_native'
      },
      liveApproved: false,
      privacyApproved: false,
      counts: {
        destinations: 1,
        readyDestinations: 1,
        degradedDestinations: 0,
        blockedDestinations: 0,
        capabilities: 2,
        readyCapabilities: 2,
        degradedCapabilities: 0,
        blockedCapabilities: 0,
        activeMappings: 1,
        outcomeEndpoints: 0,
        readyOutcomeEndpoints: 0
      }
    }))

    const result = await test.service.getReadiness(CLIENT_ID)

    expect(result.status).toBe('ready')
    expect(result.liveEligible).toBe(true)
    expect(result.approvals).toEqual({ privacy: false, live: false })
    expect(result.blockers).toEqual([])
  })

  it('marks a disabled test profile live-eligible when current evidence and approvals pass', async () => {
    const test = harness(evidence({
      profile: {
        desiredEnabled: true,
        enabled: false,
        environment: 'test',
        cacheStatus: 'fresh',
        outcomeAuthority: 'zero_native'
      },
      liveApproved: true,
      privacyApproved: true,
      counts: {
        destinations: 1,
        readyDestinations: 1,
        degradedDestinations: 0,
        blockedDestinations: 0,
        capabilities: 2,
        readyCapabilities: 2,
        degradedCapabilities: 0,
        blockedCapabilities: 0,
        activeMappings: 1,
        outcomeEndpoints: 0,
        readyOutcomeEndpoints: 0
      }
    }))

    const result = await test.service.getReadiness(CLIENT_ID)

    expect(result.status).toBe('ready')
    expect(result.liveEligible).toBe(true)
    expect(result.blockers).toEqual([])
  })

  it('keeps an explicit opt-out ineligible even when every delivery prerequisite is ready', async () => {
    const test = harness(evidence({
      profile: {
        desiredEnabled: false,
        enabled: false,
        environment: 'test',
        cacheStatus: 'fresh',
        outcomeAuthority: 'zero_native'
      },
      liveApproved: true,
      privacyApproved: true,
      counts: {
        destinations: 1,
        readyDestinations: 1,
        degradedDestinations: 0,
        blockedDestinations: 0,
        capabilities: 2,
        readyCapabilities: 2,
        degradedCapabilities: 0,
        blockedCapabilities: 0,
        activeMappings: 1,
        outcomeEndpoints: 0,
        readyOutcomeEndpoints: 0
      }
    }))

    const result = await test.service.getReadiness(CLIENT_ID)

    expect(result.liveEligible).toBe(false)
    expect(result.blockers).toContainEqual({
      code: 'desired_disabled',
      message: 'Measurement signals were deliberately turned off for this client'
    })
  })

  it('does not report ready when a nested capability lacks ready evidence', async () => {
    const test = harness(evidence({
      profile: {
        desiredEnabled: true,
        enabled: true,
        environment: 'live',
        cacheStatus: 'fresh',
        outcomeAuthority: 'zero_native'
      },
      liveApproved: true,
      privacyApproved: true,
      counts: {
        destinations: 1,
        readyDestinations: 1,
        degradedDestinations: 0,
        blockedDestinations: 0,
        capabilities: 2,
        readyCapabilities: 1,
        degradedCapabilities: 0,
        blockedCapabilities: 0,
        activeMappings: 1,
        outcomeEndpoints: 0,
        readyOutcomeEndpoints: 0
      }
    }))

    const result = await test.service.getReadiness(CLIENT_ID)

    expect(result.status).toBe('onboarding')
    expect(result.blockers).toContainEqual({
      code: 'capability_not_ready',
      message: 'One or more capabilities lack current ready evidence'
    })
  })

  it('returns a generic not-found result when no profile exists in scope', async () => {
    const test = harness(null)

    await expect(test.service.getReadiness(CLIENT_ID)).rejects.toMatchObject({
      code: 'MEASUREMENT_NOT_FOUND',
      statusCode: 404
    })
  })

  it('blocks only external-webhook authority when no tested outcome endpoint exists', async () => {
    const test = harness(evidence({
      profile: {
        desiredEnabled: true,
        enabled: false,
        environment: 'test',
        cacheStatus: 'fresh',
        outcomeAuthority: 'client_webhook'
      },
      liveApproved: true,
      privacyApproved: true,
      counts: {
        destinations: 1,
        readyDestinations: 1,
        degradedDestinations: 0,
        blockedDestinations: 0,
        capabilities: 1,
        readyCapabilities: 1,
        degradedCapabilities: 0,
        blockedCapabilities: 0,
        activeMappings: 1,
        outcomeEndpoints: 1,
        readyOutcomeEndpoints: 0
      }
    }))

    const result = await test.service.getReadiness(CLIENT_ID)

    expect(result.liveEligible).toBe(false)
    expect(result.blockers).toContainEqual({
      code: 'outcome_endpoint_not_ready',
      message: 'External outcome authority requires a tested outcome endpoint'
    })
  })
})
