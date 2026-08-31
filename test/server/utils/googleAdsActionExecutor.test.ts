import { describe, expect, it, vi } from 'vitest'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import { GoogleAdsActionError } from '~~/server/utils/googleAds/errors'
import { hashGoogleAdsValue } from '~~/server/utils/googleAds/actionPlanner'
import { executeGoogleAdsAction } from '~~/server/utils/googleAds/actionExecutor'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const PLAN_ID = '44444444-4444-4444-8444-444444444444'
const CURRENT = { resourceName: 'customers/123/campaigns/987', status: 'ENABLED' }

function plan(overrides: Partial<GoogleAdsActionPlan> = {}): GoogleAdsActionPlan {
  return {
    id: PLAN_ID,
    clientId: CLIENT_ID,
    connectionId: CONNECTION_ID,
    customerId: '123',
    actorId: ACTOR_ID,
    source: 'mcp',
    toolName: 'google_ads.pause_campaign',
    resourceType: 'campaign',
    resourceName: 'customers/123/campaigns/987',
    operation: 'pause_campaign',
    currentState: CURRENT,
    desiredState: { ...CURRENT, status: 'PAUSED' },
    currentStateFingerprint: hashGoogleAdsValue(CURRENT),
    diff: [{ field: 'status', before: 'ENABLED', after: 'PAUSED' }],
    providerOperations: [{
      service: 'campaigns',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{
        update: { resourceName: 'customers/123/campaigns/987', status: 'PAUSED' },
        updateMask: 'status'
      }]
    }],
    riskTier: 'automatic',
    executionMode: 'automatic',
    policyVersion: 'google-ads-v1',
    policyDecision: { allowed: true, riskTier: 'automatic', executionMode: 'automatic' },
    requestHash: 'b'.repeat(64),
    idempotencyKey: 'pause-987',
    status: 'planned',
    expiresAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-08-31T00:00:00.000Z',
    ...overrides
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    loadPlan: vi.fn().mockResolvedValue(plan()),
    loadCurrent: vi.fn().mockResolvedValue(CURRENT),
    resolvePolicy: vi.fn().mockReturnValue({
      allowed: true,
      riskTier: 'automatic' as const,
      executionMode: 'automatic' as const
    }),
    claim: vi.fn().mockResolvedValue(true),
    validate: vi.fn().mockResolvedValue({ results: [] }),
    mutate: vi.fn().mockResolvedValue({ results: [{}], requestId: 'provider-request-1' }),
    verify: vi.fn().mockResolvedValue({ ok: true, diffs: [] }),
    event: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

const context = { clientId: CLIENT_ID, actorId: ACTOR_ID }

describe('Google Ads action executor', () => {
  it('makes zero provider calls when the revalidated policy blocks writes', async () => {
    const deps = dependencies({
      resolvePolicy: vi.fn().mockReturnValue({
        allowed: false,
        riskTier: 'blocked',
        executionMode: 'blocked',
        code: 'writes_disabled'
      })
    })

    await expect(executeGoogleAdsAction(PLAN_ID, context, deps))
      .resolves.toMatchObject({ ok: false, status: 'blocked', code: 'writes_disabled' })
    expect(deps.loadCurrent).not.toHaveBeenCalled()
    expect(deps.validate).not.toHaveBeenCalled()
    expect(deps.mutate).not.toHaveBeenCalled()
  })

  it('requires replanning when the account policy version changes', async () => {
    const deps = dependencies({
      resolvePolicy: vi.fn().mockReturnValue({
        allowed: true,
        riskTier: 'automatic',
        executionMode: 'automatic',
        policyVersion: 'google-ads-v2'
      })
    })

    await expect(executeGoogleAdsAction(PLAN_ID, context, deps))
      .resolves.toMatchObject({ ok: false, status: 'policy_changed' })
    expect(deps.loadCurrent).not.toHaveBeenCalled()
    expect(deps.claim).not.toHaveBeenCalled()
  })

  it('makes zero provider calls for an unapproved proposal', async () => {
    const deps = dependencies({
      loadPlan: vi.fn().mockResolvedValue(plan({
        riskTier: 'confirm',
        executionMode: 'proposal',
        policyDecision: { allowed: true, riskTier: 'confirm', executionMode: 'proposal' },
        status: 'pending_approval'
      }))
    })

    await expect(executeGoogleAdsAction(PLAN_ID, context, deps))
      .resolves.toMatchObject({ ok: false, status: 'confirmation_required' })
    expect(deps.loadCurrent).not.toHaveBeenCalled()
    expect(deps.validate).not.toHaveBeenCalled()
    expect(deps.mutate).not.toHaveBeenCalled()
  })

  it('revalidates current state before claiming the action', async () => {
    const deps = dependencies({
      loadCurrent: vi.fn().mockResolvedValue({ ...CURRENT, status: 'PAUSED' })
    })

    await expect(executeGoogleAdsAction(PLAN_ID, context, deps))
      .resolves.toMatchObject({ ok: false, status: 'stale_plan' })
    expect(deps.claim).not.toHaveBeenCalled()
    expect(deps.validate).not.toHaveBeenCalled()
  })

  it('allows only the successful atomic claimant to reach validation', async () => {
    const deps = dependencies({ claim: vi.fn().mockResolvedValue(false) })

    await expect(executeGoogleAdsAction(PLAN_ID, context, deps))
      .resolves.toMatchObject({ ok: false, status: 'already_handled' })
    expect(deps.validate).not.toHaveBeenCalled()
    expect(deps.mutate).not.toHaveBeenCalled()
  })

  it('runs validate-only before the single live mutation', async () => {
    const deps = dependencies()

    await expect(executeGoogleAdsAction(PLAN_ID, context, deps))
      .resolves.toMatchObject({ ok: true, status: 'verified' })
    expect(deps.validate).toHaveBeenCalledBefore(deps.mutate)
    expect(deps.mutate).toHaveBeenCalledTimes(1)
  })

  it('records validate-only rejection and never calls the live mutation', async () => {
    const deps = dependencies({
      validate: vi.fn().mockResolvedValue({
        results: [],
        partialFailureError: { code: 'POLICY_FINDING' },
        requestId: 'validation-request-1'
      })
    })

    await expect(executeGoogleAdsAction(PLAN_ID, context, deps))
      .resolves.toMatchObject({ ok: false, status: 'provider_rejected' })
    expect(deps.mutate).not.toHaveBeenCalled()
    expect(deps.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'provider_rejected',
      providerRequestId: 'validation-request-1'
    }))
  })

  it('records verified only after a matching provider read-back', async () => {
    const deps = dependencies()

    await expect(executeGoogleAdsAction(PLAN_ID, context, deps))
      .resolves.toEqual(expect.objectContaining({
        ok: true,
        status: 'verified',
        providerRequestId: 'provider-request-1'
      }))
    expect(deps.verify).toHaveBeenCalledAfter(deps.mutate)
    expect(deps.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'verified',
      verificationSummary: { ok: true, diffs: [] }
    }))
  })

  it('records verification failure when provider read-back drifts', async () => {
    const diffs = [{ field: 'status', expected: 'PAUSED', actual: 'ENABLED' }]
    const deps = dependencies({
      verify: vi.fn().mockResolvedValue({ ok: false, diffs })
    })

    await expect(executeGoogleAdsAction(PLAN_ID, context, deps))
      .resolves.toMatchObject({ ok: false, status: 'verification_failed', diffs })
    expect(deps.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'verification_failed',
      verificationSummary: { ok: false, diffs }
    }))
  })

  it('records recovery required after an ambiguous timeout and never retries the write', async () => {
    const deps = dependencies({
      mutate: vi.fn().mockRejectedValue(new GoogleAdsActionError({
        code: 'DEADLINE_EXCEEDED',
        category: 'provider',
        retryable: true,
        requestId: 'ambiguous-request-1',
        safeMessage: 'Google Ads is temporarily unavailable.'
      }))
    })

    await expect(executeGoogleAdsAction(PLAN_ID, context, deps))
      .resolves.toMatchObject({ ok: false, status: 'recovery_required' })
    expect(deps.mutate).toHaveBeenCalledTimes(1)
    expect(deps.verify).not.toHaveBeenCalled()
    expect(deps.complete).toHaveBeenCalledWith(expect.objectContaining({
      status: 'recovery_required',
      providerRequestId: 'ambiguous-request-1'
    }))
  })
})
