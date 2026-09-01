import { describe, expect, it, vi } from 'vitest'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import {
  inspectGoogleAdsActionPlanDrift,
  reverifyGoogleAdsActionPlan
} from '~~/server/utils/googleAds/reverification'

const actorId = '11111111-1111-4111-8111-111111111111'

function plan(overrides: Partial<GoogleAdsActionPlan> = {}): GoogleAdsActionPlan {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    clientId: '33333333-3333-4333-8333-333333333333',
    connectionId: '44444444-4444-4444-8444-444444444444',
    customerId: '1234567890',
    actorId,
    operation: 'pause_campaign',
    resourceType: 'campaign',
    resourceName: 'customers/1234567890/campaigns/10',
    desiredState: { resourceName: 'customers/1234567890/campaigns/10', status: 'PAUSED' },
    status: 'recovery_required',
    ...overrides
  } as GoogleAdsActionPlan
}

function dependencies(actualState: unknown) {
  return {
    resolveSession: vi.fn().mockResolvedValue({
      connection: {
        clientId: '33333333-3333-4333-8333-333333333333',
        connectionId: '44444444-4444-4444-8444-444444444444',
        customerId: '1234567890'
      },
      auth: { accessToken: 'access', developerToken: 'developer' }
    }),
    loadState: vi.fn().mockResolvedValue(actualState),
    event: vi.fn().mockResolvedValue(undefined),
    reconcile: vi.fn().mockResolvedValue(plan({ status: 'verified' }))
  }
}

describe('Google Ads drift inspection and manual reverification', () => {
  it('reports field-level drift without issuing a provider mutation', async () => {
    const deps = dependencies({
      resourceName: 'customers/1234567890/campaigns/10',
      status: 'ENABLED'
    })
    await expect(inspectGoogleAdsActionPlanDrift(plan(), actorId, deps)).resolves.toMatchObject({
      supported: true,
      matchesDesiredState: false,
      diffs: [{ field: 'status', expected: 'PAUSED', actual: 'ENABLED' }]
    })
    expect(deps.loadState).toHaveBeenCalledTimes(1)
    expect(deps.event).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'drift_inspected',
      metadata: { matchesDesiredState: false, diffFields: ['status'] }
    }))
  })

  it('marks an eligible terminal plan verified only after desired state reads back', async () => {
    const deps = dependencies({
      resourceName: 'customers/1234567890/campaigns/10',
      status: 'PAUSED'
    })
    await expect(reverifyGoogleAdsActionPlan(plan(), actorId, deps)).resolves.toMatchObject({
      supported: true,
      matchesDesiredState: true,
      reconciled: true,
      status: 'verified'
    })
    expect(deps.reconcile).toHaveBeenCalledWith(expect.objectContaining({
      actorId,
      verificationSummary: { ok: true, diffs: [] }
    }))
    expect(deps.event).toHaveBeenLastCalledWith(expect.objectContaining({
      eventType: 'reverification_succeeded'
    }))
  })

  it('does not reconcile a plan while provider drift remains', async () => {
    const deps = dependencies({
      resourceName: 'customers/1234567890/campaigns/10',
      status: 'ENABLED'
    })
    await expect(reverifyGoogleAdsActionPlan(plan(), actorId, deps)).resolves.toMatchObject({
      matchesDesiredState: false,
      reconciled: false
    })
    expect(deps.reconcile).not.toHaveBeenCalled()
  })

  it('fails closed for create plans whose provider resource ID was not persisted', async () => {
    const deps = dependencies({})
    await expect(inspectGoogleAdsActionPlanDrift(plan({
      operation: 'create_budget',
      resourceName: null
    }), actorId, deps)).resolves.toMatchObject({
      supported: false,
      reason: 'provider_resource_not_persisted'
    })
    expect(deps.resolveSession).not.toHaveBeenCalled()
    expect(deps.loadState).not.toHaveBeenCalled()
  })
})
