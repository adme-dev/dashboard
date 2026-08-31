import { describe, expect, it, vi } from 'vitest'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import {
  appendGoogleAdsActionEvent,
  approveGoogleAdsActionPlan,
  claimGoogleAdsActionPlan,
  completeGoogleAdsActionPlan,
  createGoogleAdsActionPlan,
  getGoogleAdsActionPlan,
  getGoogleAdsActionPlanForActor,
  linkGoogleAdsActionApproval
} from '~~/server/utils/googleAds/actionStore'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const PLAN_ID = '44444444-4444-4444-8444-444444444444'
const FINGERPRINT = 'a'.repeat(64)
const REQUEST_HASH = 'b'.repeat(64)

function makePlan(overrides: Partial<GoogleAdsActionPlan> = {}): GoogleAdsActionPlan {
  return {
    id: PLAN_ID,
    clientId: CLIENT_ID,
    connectionId: CONNECTION_ID,
    customerId: '1234567890',
    actorId: ACTOR_ID,
    source: 'mcp',
    toolName: 'google_ads.add_negative_keywords',
    resourceType: 'negative_keyword',
    resourceName: 'customers/1234567890/adGroupCriteria/1~2',
    operation: 'add_negative_keywords',
    currentState: { keywords: [] },
    desiredState: { keywords: ['jobs'] },
    currentStateFingerprint: FINGERPRINT,
    diff: [{ field: 'keywords', before: [], after: ['jobs'] }],
    providerOperations: [{
      service: 'adGroupCriteria',
      atomicity: 'independent',
      partialFailure: true,
      operations: [{ create: { negative: true, text: 'jobs' } }]
    }],
    riskTier: 'automatic',
    executionMode: 'automatic',
    policyVersion: 'google-ads-v1',
    policyDecision: {
      allowed: true,
      riskTier: 'automatic',
      executionMode: 'automatic'
    },
    requestHash: REQUEST_HASH,
    idempotencyKey: 'request-123',
    status: 'planned',
    expiresAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-08-31T00:00:00.000Z',
    ...overrides
  }
}

describe('Google Ads action store', () => {
  it('returns the existing client-scoped plan when an idempotency key conflicts', async () => {
    const existing = makePlan()
    const queryOne = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing)

    await expect(createGoogleAdsActionPlan(existing, { queryOne })).resolves.toEqual(existing)

    expect(queryOne).toHaveBeenCalledTimes(2)
    expect(queryOne.mock.calls[0]?.[0]).toContain('ON CONFLICT (client_id, idempotency_key) DO NOTHING')
    expect(queryOne.mock.calls[1]?.[0]).toContain('client_id = $1 AND idempotency_key = $2')
    expect(queryOne.mock.calls[1]?.[1]).toEqual([CLIENT_ID, 'request-123'])
  })

  it('rejects reuse of an idempotency key for a different request', async () => {
    const submitted = makePlan()
    const queryOne = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makePlan({ requestHash: 'c'.repeat(64) }))

    await expect(createGoogleAdsActionPlan(submitted, { queryOne }))
      .rejects.toThrow('different Google Ads request')
  })

  it('always scopes plan reads to the client', async () => {
    const queryOne = vi.fn().mockResolvedValue(makePlan())

    await expect(getGoogleAdsActionPlan(PLAN_ID, CLIENT_ID, { queryOne })).resolves.toMatchObject({ id: PLAN_ID })

    expect(queryOne.mock.calls[0]?.[0]).toContain('WHERE id = $1 AND client_id = $2')
    expect(queryOne.mock.calls[0]?.[1]).toEqual([PLAN_ID, CLIENT_ID])
  })

  it('loads an MCP plan only through its bound actor', async () => {
    const queryOne = vi.fn().mockResolvedValue(makePlan())

    await getGoogleAdsActionPlanForActor(PLAN_ID, ACTOR_ID, { queryOne })

    expect(queryOne.mock.calls[0]?.[0]).toContain('WHERE id = $1 AND actor_id = $2')
    expect(queryOne.mock.calls[0]?.[1]).toEqual([PLAN_ID, ACTOR_ID])
  })

  it('links and approves only the actor-owned pending plan', async () => {
    const approvalId = '77777777-7777-4777-8777-777777777777'
    const queryOne = vi.fn()
      .mockResolvedValueOnce(makePlan({ approvalId }))
      .mockResolvedValueOnce(makePlan({ approvalId, status: 'approved' }))

    await linkGoogleAdsActionApproval({
      id: PLAN_ID,
      clientId: CLIENT_ID,
      actorId: ACTOR_ID,
      approvalId
    }, { queryOne })
    await approveGoogleAdsActionPlan({
      id: PLAN_ID,
      clientId: CLIENT_ID,
      actorId: ACTOR_ID,
      approvalId
    }, { queryOne })

    expect(queryOne.mock.calls[0]?.[0]).toContain('status = \'pending_approval\'')
    expect(queryOne.mock.calls[0]?.[0]).toContain('approval_id IS NULL OR approval_id = $4')
    expect(queryOne.mock.calls[1]?.[0]).toContain('SET status = \'approved\'')
    expect(queryOne.mock.calls[1]?.[0]).toContain('approval_id = $4')
  })

  it('normalizes PostgreSQL timestamp strings at the repository boundary', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      ...makePlan(),
      expiresAt: '2026-09-01 00:00:00+00',
      createdAt: '2026-08-31 00:00:00+00',
      updatedAt: '2026-08-31 00:01:00+00'
    })

    const plan = await getGoogleAdsActionPlan(PLAN_ID, CLIENT_ID, { queryOne })

    expect(plan?.createdAt).toBe('2026-08-31T00:00:00.000Z')
    expect(plan?.updatedAt).toBe('2026-08-31T00:01:00.000Z')
  })

  it('atomically claims only the actor-owned, unexpired plan in the expected state', async () => {
    const executing = makePlan({ status: 'executing' })
    const queryOne = vi.fn().mockResolvedValue(executing)

    await expect(claimGoogleAdsActionPlan({
      id: PLAN_ID,
      clientId: CLIENT_ID,
      actorId: ACTOR_ID,
      expectedStatus: 'approved'
    }, { queryOne })).resolves.toEqual(executing)

    const [sql, params] = queryOne.mock.calls[0]!
    expect(sql).toContain('actor_id = $3')
    expect(sql).toContain('status = $4')
    expect(sql).toContain('expires_at > NOW()')
    expect(params).toEqual([PLAN_ID, CLIENT_ID, ACTOR_ID, 'approved'])
  })

  it('inserts events through a tenant-scoped plan selection', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      planId: PLAN_ID,
      clientId: CLIENT_ID,
      eventType: 'claimed',
      metadata: { source: 'mcp' },
      createdAt: '2026-08-31T00:01:00.000Z'
    })

    await appendGoogleAdsActionEvent({
      planId: PLAN_ID,
      clientId: CLIENT_ID,
      actorId: ACTOR_ID,
      eventType: 'claimed',
      metadata: { source: 'mcp' }
    }, { queryOne })

    expect(queryOne.mock.calls[0]?.[0]).toContain('INSERT INTO google_ads_action_events')
    expect(queryOne.mock.calls[0]?.[0]).toContain('FROM google_ads_action_plans')
    expect(queryOne.mock.calls[0]?.[0]).toContain('WHERE id = $1 AND client_id = $2')
  })

  it('rejects event metadata containing credentials before it reaches the database', async () => {
    const queryOne = vi.fn()

    await expect(appendGoogleAdsActionEvent({
      planId: PLAN_ID,
      clientId: CLIENT_ID,
      actorId: ACTOR_ID,
      eventType: 'provider_rejected',
      metadata: { nested: { accessToken: 'must-not-be-stored' } }
    }, { queryOne })).rejects.toThrow('sensitive')

    expect(queryOne).not.toHaveBeenCalled()
  })

  it('accepts JSON-safe shared references without treating them as cycles', async () => {
    const shared = { result: 'ok' }
    const queryOne = vi.fn().mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      planId: PLAN_ID,
      clientId: CLIENT_ID,
      actorId: null,
      eventType: 'verified',
      metadata: { first: shared, second: shared },
      createdAt: '2026-08-31T00:01:00.000Z'
    })

    await expect(appendGoogleAdsActionEvent({
      planId: PLAN_ID,
      clientId: CLIENT_ID,
      eventType: 'verified',
      metadata: { first: shared, second: shared }
    }, { queryOne })).resolves.toMatchObject({ eventType: 'verified' })
  })

  it('completes only a claimed plan and records bounded verification evidence', async () => {
    const completed = makePlan({
      status: 'verified',
      providerRequestId: 'provider-request-1',
      verificationSummary: { matched: true },
      resultMetadata: { mutationCount: 1 }
    })
    const queryOne = vi.fn().mockResolvedValue(completed)

    await expect(completeGoogleAdsActionPlan({
      id: PLAN_ID,
      clientId: CLIENT_ID,
      status: 'verified',
      providerRequestId: 'provider-request-1',
      verificationSummary: { matched: true },
      resultMetadata: { mutationCount: 1 }
    }, { queryOne })).resolves.toEqual(completed)

    const [sql] = queryOne.mock.calls[0]!
    expect(sql).toContain('status = \'executing\'')
    expect(sql).toContain('verification_summary')
    expect(sql).toContain('provider_request_id')
  })
})
