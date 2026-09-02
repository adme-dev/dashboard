import { describe, expect, it } from 'vitest'
import {
  ListMeasurementAuditSchema,
  MeasurementAuditEntrySchema,
  MeasurementReadinessSummarySchema
} from '../../../../server/utils/measurement/contracts'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'

describe('Measurement read contracts', () => {
  it('bounds and coerces audit pagination at the service boundary', () => {
    const result = ListMeasurementAuditSchema.parse({
      clientId: CLIENT_ID,
      page: '2',
      pageSize: '50',
      entityType: 'destination'
    })

    expect(result).toEqual({
      clientId: CLIENT_ID,
      page: 2,
      pageSize: 50,
      entityType: 'destination'
    })
    expect(ListMeasurementAuditSchema.safeParse({
      clientId: CLIENT_ID,
      page: 1,
      pageSize: 500
    }).success).toBe(false)
  })

  it('keeps audit output metadata-only and rejects stored before/after state', () => {
    const entry = {
      id: '33333333-3333-4333-8333-333333333333',
      profileId: PROFILE_ID,
      entityType: 'destination',
      entityId: '44444444-4444-4444-8444-444444444444',
      action: 'created',
      configVersion: 2,
      changedFields: ['destination', 'capabilities', 'mappings'],
      actorType: 'team_member',
      actorId: '55555555-5555-4555-8555-555555555555',
      reason: 'Configure Meta CRM delivery in test mode',
      requestId: null,
      createdAt: '2026-07-17T01:00:00.000Z'
    }

    expect(MeasurementAuditEntrySchema.parse(entry).configVersion).toBe(2)
    expect(MeasurementAuditEntrySchema.safeParse({
      ...entry,
      afterState: { credentialRef: 'must-not-leave-audit-storage' }
    }).success).toBe(false)
  })

  it('accepts lifecycle mapping rows added by the lifecycle migration', () => {
    const entry = {
      id: '33333333-3333-4333-8333-333333333333',
      profileId: PROFILE_ID,
      entityType: 'lifecycle_mapping',
      entityId: '44444444-4444-4444-8444-444444444444',
      action: 'created',
      configVersion: 5,
      changedFields: ['lifecycleMapping'],
      actorType: 'team_member',
      actorId: '55555555-5555-4555-8555-555555555555',
      reason: 'Map qualified leads to the canonical qualified event',
      requestId: null,
      createdAt: '2026-07-17T01:00:00.000Z'
    }

    expect(MeasurementAuditEntrySchema.parse(entry).entityType).toBe('lifecycle_mapping')
  })

  it('represents readiness with counts and stable blockers rather than provider claims', () => {
    const result = MeasurementReadinessSummarySchema.parse({
      clientId: CLIENT_ID,
      profileId: PROFILE_ID,
      configVersion: 2,
      status: 'onboarding',
      liveEligible: false,
      approvals: { privacy: false, live: false },
      profile: {
        desiredEnabled: true,
        enabled: false,
        environment: 'test',
        cacheStatus: 'fresh',
        outcomeAuthority: 'zero_native'
      },
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
      blockers: [{ code: 'profile_disabled', message: 'Measurement profile is disabled' }],
      lastValidatedAt: null,
      lastSuccessAt: null
    })

    expect(result.status).toBe('onboarding')
    expect(result.liveEligible).toBe(false)
    expect(result.approvals).toEqual({ privacy: false, live: false })
  })
})
