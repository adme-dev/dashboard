import { describe, expect, it, vi } from 'vitest'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import {
  diffGoogleAdsStates,
  hashGoogleAdsValue,
  planGoogleAdsAction
} from '~~/server/utils/googleAds/actionPlanner'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const PLAN_ID = '44444444-4444-4444-8444-444444444444'

function input(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT_ID,
    connectionId: CONNECTION_ID,
    actorId: ACTOR_ID,
    source: 'mcp' as const,
    operation: 'pause_campaign' as const,
    resourceType: 'campaign' as const,
    requestedMode: 'automatic' as const,
    arguments: { resourceName: 'customers/1234567890/campaigns/987' },
    idempotencyKey: 'pause-campaign-987',
    ...overrides
  }
}

function dependencies() {
  return {
    resolveConnection: vi.fn().mockResolvedValue({
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      customerId: '1234567890',
      platform: 'google' as const,
      status: 'active' as const
    }),
    loadCurrent: vi.fn().mockResolvedValue({
      resourceName: 'customers/1234567890/campaigns/987',
      status: 'ENABLED',
      name: 'Northern GAC'
    }),
    buildAction: vi.fn().mockResolvedValue({
      resourceName: 'customers/1234567890/campaigns/987',
      desiredState: {
        resourceName: 'customers/1234567890/campaigns/987',
        status: 'PAUSED',
        name: 'Northern GAC'
      },
      providerOperations: [{
        service: 'campaigns' as const,
        atomicity: 'interdependent' as const,
        partialFailure: false,
        operations: [{
          update: {
            resourceName: 'customers/1234567890/campaigns/987',
            status: 'PAUSED'
          },
          updateMask: 'status'
        }]
      }]
    }),
    resolvePolicy: vi.fn().mockReturnValue({
      allowed: true,
      riskTier: 'automatic' as const,
      executionMode: 'automatic' as const
    }),
    persist: vi.fn(async (plan: GoogleAdsActionPlan) => plan),
    now: vi.fn(() => new Date('2026-08-31T00:00:00.000Z')),
    randomUUID: vi.fn(() => PLAN_ID)
  }
}

describe('Google Ads action planner', () => {
  it('hashes equivalent objects identically regardless of key insertion order', () => {
    expect(hashGoogleAdsValue({ beta: 2, alpha: { z: 1, a: 2 } }))
      .toBe(hashGoogleAdsValue({ alpha: { a: 2, z: 1 }, beta: 2 }))
  })

  it('computes deterministic field-level diffs', () => {
    expect(diffGoogleAdsStates(
      { name: 'Campaign', status: 'ENABLED', bidding: { strategy: 'MAXIMIZE_CLICKS' } },
      { name: 'Campaign', status: 'PAUSED', bidding: { strategy: 'TARGET_CPA' } }
    )).toEqual([
      { field: 'bidding.strategy', before: 'MAXIMIZE_CLICKS', after: 'TARGET_CPA' },
      { field: 'status', before: 'ENABLED', after: 'PAUSED' }
    ])
  })

  it('loads current state before persisting a tenant-bound immutable plan', async () => {
    const deps = dependencies()

    const plan = await planGoogleAdsAction(input(), deps)

    expect(deps.resolveConnection).toHaveBeenCalledWith(CLIENT_ID, CONNECTION_ID)
    expect(deps.loadCurrent).toHaveBeenCalledBefore(deps.buildAction)
    expect(deps.buildAction).toHaveBeenCalledWith(expect.objectContaining({
      customerId: '1234567890',
      currentState: expect.objectContaining({ status: 'ENABLED' })
    }))
    expect(deps.persist).toHaveBeenCalledWith(expect.objectContaining({
      id: PLAN_ID,
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      customerId: '1234567890',
      actorId: ACTOR_ID,
      currentStateFingerprint: hashGoogleAdsValue({
        resourceName: 'customers/1234567890/campaigns/987',
        status: 'ENABLED',
        name: 'Northern GAC'
      }),
      riskTier: 'automatic',
      executionMode: 'automatic',
      status: 'planned'
    }))
    expect(plan.diff).toContainEqual({ field: 'status', before: 'ENABLED', after: 'PAUSED' })
  })

  it('returns the existing plan supplied by idempotent persistence', async () => {
    const deps = dependencies()
    const existing = {
      ...(await planGoogleAdsAction(input(), deps)),
      id: '55555555-5555-4555-8555-555555555555'
    }
    deps.persist.mockResolvedValueOnce(existing)

    await expect(planGoogleAdsAction(input(), deps)).resolves.toEqual(existing)
  })

  it('rejects provider resources outside the selected Google Ads customer', async () => {
    const deps = dependencies()

    await expect(planGoogleAdsAction(input({
      arguments: { resourceName: 'customers/9999999999/campaigns/987' }
    }), deps)).rejects.toThrow('selected Google Ads customer')

    expect(deps.loadCurrent).not.toHaveBeenCalled()
    expect(deps.persist).not.toHaveBeenCalled()
  })

  it('rejects a connection owned by another client before provider reads', async () => {
    const deps = dependencies()
    deps.resolveConnection.mockResolvedValueOnce({
      clientId: '66666666-6666-4666-8666-666666666666',
      connectionId: CONNECTION_ID,
      customerId: '1234567890',
      platform: 'google',
      status: 'active'
    })

    await expect(planGoogleAdsAction(input(), deps)).rejects.toThrow('not assigned to this client')
    expect(deps.loadCurrent).not.toHaveBeenCalled()
  })
})
