import { describe, expect, it, vi } from 'vitest'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import { hashGoogleAdsValue } from '~~/server/utils/googleAds/actionPlanner'
import {
  executeSearchGoogleAdsControlAction,
  isExecutableSearchGoogleAdsPlan,
  planSearchGoogleAdsControlAction,
  validateSearchGoogleAdsControlPlan,
  type GoogleAdsControlAuthority
} from '~~/server/utils/googleAds/searchRuntime'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'

const authority: GoogleAdsControlAuthority = {
  actorRole: 'media_buyer',
  hasWriteScope: true
}

const flags = {
  read: true,
  write: true,
  automation: true,
  destructive: false
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    resolveSession: vi.fn().mockResolvedValue({
      connection: {
        clientId: CLIENT_ID,
        connectionId: CONNECTION_ID,
        customerId: '1234567890',
        platform: 'google',
        status: 'active'
      },
      auth: { accessToken: 'access', developerToken: 'developer' }
    }),
    loadCurrent: vi.fn().mockResolvedValue({
      resourceName: 'customers/1234567890/campaigns/10',
      status: 'ENABLED'
    }),
    loadAutomationPolicy: vi.fn().mockResolvedValue(null),
    persist: vi.fn(async (plan: GoogleAdsActionPlan) => plan),
    event: vi.fn().mockResolvedValue(undefined),
    now: () => new Date('2026-08-31T00:00:00.000Z'),
    randomUUID: () => '44444444-4444-4444-8444-444444444444',
    ...overrides
  }
}

describe('Search Google Ads governed planning runtime', () => {
  it('plans a manual pause as a confirmation without requiring an automation grant', async () => {
    const deps = dependencies()
    const plan = await planSearchGoogleAdsControlAction({
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      actorId: ACTOR_ID,
      source: 'mcp',
      operation: 'pause_campaign',
      resourceType: 'campaign',
      requestedMode: 'proposal',
      arguments: { resourceName: 'customers/1234567890/campaigns/10' },
      idempotencyKey: 'pause-campaign-10'
    }, authority, flags, deps)

    expect(plan).toMatchObject({
      operation: 'pause_campaign',
      riskTier: 'confirm',
      executionMode: 'proposal',
      status: 'pending_approval'
    })
    expect(deps.loadAutomationPolicy).not.toHaveBeenCalled()
    expect(deps.event).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'planned'
    }))
  })

  it('plans automatic negative keywords only with a matching account grant', async () => {
    const parentResourceName = 'customers/1234567890/adGroups/20'
    const deps = dependencies({
      loadCurrent: vi.fn().mockResolvedValue({ criteria: [] }),
      loadAutomationPolicy: vi.fn().mockResolvedValue({
        id: '55555555-5555-4555-8555-555555555555',
        actionClass: 'negative_keywords',
        policyVersion: 'negative-v3',
        enabled: true,
        conditions: {},
        maxDailyActions: 20,
        actionsToday: 2
      })
    })

    const plan = await planSearchGoogleAdsControlAction({
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      actorId: ACTOR_ID,
      source: 'automation',
      operation: 'add_negative_keywords',
      resourceType: 'negative_keyword',
      requestedMode: 'automatic',
      arguments: {
        scope: 'ad_group',
        parentResourceName,
        keywords: [{ text: 'jobs', matchType: 'PHRASE' }]
      },
      idempotencyKey: 'negative-adgroup-20-jobs'
    }, authority, flags, deps)

    expect(plan).toMatchObject({
      grantId: '55555555-5555-4555-8555-555555555555',
      policyVersion: 'negative-v3',
      riskTier: 'automatic',
      executionMode: 'automatic',
      status: 'planned'
    })
  })

  it('persists a blocked automatic plan when no matching grant exists', async () => {
    const deps = dependencies({
      loadCurrent: vi.fn().mockResolvedValue({ criteria: [] })
    })
    const plan = await planSearchGoogleAdsControlAction({
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      actorId: ACTOR_ID,
      source: 'automation',
      operation: 'add_negative_keywords',
      resourceType: 'negative_keyword',
      requestedMode: 'automatic',
      arguments: {
        scope: 'campaign',
        parentResourceName: 'customers/1234567890/campaigns/10',
        keywords: [{ text: 'free', matchType: 'EXACT' }]
      },
      idempotencyKey: 'blocked-negative-10'
    }, authority, flags, deps)

    expect(plan).toMatchObject({
      riskTier: 'blocked',
      executionMode: 'blocked',
      status: 'cancelled',
      policyDecision: { allowed: false }
    })
  })

  it('fails closed when an automatic negative-keyword request exceeds grant conditions', async () => {
    const deps = dependencies({
      loadCurrent: vi.fn().mockResolvedValue({ criteria: [] }),
      loadAutomationPolicy: vi.fn().mockResolvedValue({
        id: '55555555-5555-4555-8555-555555555555',
        actionClass: 'negative_keywords',
        policyVersion: 'negative-v4',
        enabled: true,
        conditions: {
          maxKeywordsPerAction: 1,
          allowedMatchTypes: ['EXACT']
        },
        maxDailyActions: 20,
        actionsToday: 2
      })
    })
    const plan = await planSearchGoogleAdsControlAction({
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      actorId: ACTOR_ID,
      source: 'automation',
      operation: 'add_negative_keywords',
      resourceType: 'negative_keyword',
      requestedMode: 'automatic',
      arguments: {
        scope: 'campaign',
        parentResourceName: 'customers/1234567890/campaigns/10',
        keywords: [
          { text: 'free', matchType: 'EXACT' },
          { text: 'jobs', matchType: 'PHRASE' }
        ]
      },
      idempotencyKey: 'bounded-negative-10'
    }, authority, flags, deps)

    expect(plan).toMatchObject({
      status: 'cancelled',
      policyDecision: { allowed: false }
    })
  })
})

describe('Search Google Ads governed execution runtime', () => {
  it.each([
    ['create_budget', 'campaignBudgets'],
    ['update_budget', 'campaignBudgets'],
    ['create_campaign', 'campaigns'],
    ['create_ad_group', 'adGroups'],
    ['create_ad', 'adGroupAds'],
    ['add_keywords', 'adGroupCriteria'],
    ['set_locations', 'campaignCriteria'],
    ['set_location_match_mode', 'campaigns'],
    ['set_languages', 'campaignCriteria'],
    ['set_ad_schedule', 'campaignCriteria']
  ] as const)('activates governed execution for %s', (operation, service) => {
    expect(isExecutableSearchGoogleAdsPlan({
      operation,
      providerOperations: [{ service }]
    } as GoogleAdsActionPlan)).toBe(true)
  })

  it('rejects a persisted Search plan whose provider service does not match its typed operation', () => {
    expect(isExecutableSearchGoogleAdsPlan({
      operation: 'create_campaign',
      providerOperations: [{ service: 'campaignBudgets' }]
    } as GoogleAdsActionPlan)).toBe(false)
  })

  it('uses the provider mutation resource to verify a created campaign', async () => {
    const currentState = {
      exists: false,
      campaignBudgetResourceName: 'customers/1234567890/campaignBudgets/50'
    }
    const desiredState = {
      name: 'Northern Search',
      status: 'PAUSED',
      advertisingChannelType: 'SEARCH',
      campaignBudget: 'customers/1234567890/campaignBudgets/50',
      manualCpc: {},
      networkSettings: {
        targetGoogleSearch: true,
        targetSearchNetwork: true,
        targetPartnerSearchNetwork: false,
        targetContentNetwork: false
      },
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'
    }
    const plan = {
      id: '44444444-4444-4444-8444-444444444444',
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      customerId: '1234567890',
      actorId: ACTOR_ID,
      source: 'mcp',
      toolName: 'google_ads.create_campaign',
      resourceType: 'campaign',
      resourceName: null,
      operation: 'create_campaign',
      currentState,
      desiredState,
      currentStateFingerprint: hashGoogleAdsValue(currentState),
      diff: [],
      providerOperations: [{
        service: 'campaigns',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ create: desiredState }]
      }],
      riskTier: 'confirm',
      executionMode: 'proposal',
      policyVersion: 'google-ads-v1',
      policyDecision: { allowed: true, riskTier: 'confirm', executionMode: 'proposal' },
      requestHash: 'b'.repeat(64),
      idempotencyKey: 'create-campaign-60',
      status: 'approved',
      expiresAt: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-08-31T00:00:00.000Z'
    } as GoogleAdsActionPlan
    const liveMutation = {
      results: [{ campaign: { resourceName: 'customers/1234567890/campaigns/60' } }],
      requestId: 'live-create-request'
    }
    const loadPlanState = vi.fn()
      .mockResolvedValueOnce(currentState)
      .mockResolvedValueOnce({
        resourceName: 'customers/1234567890/campaigns/60',
        ...desiredState
      })
    const mutate = vi.fn()
      .mockResolvedValueOnce({ results: [], requestId: 'validate-create-request' })
      .mockResolvedValueOnce(liveMutation)

    await expect(executeSearchGoogleAdsControlAction(plan, authority, flags, {
      resolveSession: vi.fn().mockResolvedValue({
        connection: {
          clientId: CLIENT_ID,
          connectionId: CONNECTION_ID,
          customerId: '1234567890',
          platform: 'google',
          status: 'active'
        },
        auth: { accessToken: 'access', developerToken: 'developer' }
      }),
      loadPlan: vi.fn().mockResolvedValue(plan),
      loadPlanState,
      loadAutomationPolicy: vi.fn().mockResolvedValue(null),
      mutate,
      claim: vi.fn().mockResolvedValue(plan),
      event: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(plan)
    })).resolves.toMatchObject({
      ok: true,
      status: 'verified',
      providerRequestId: 'live-create-request'
    })
    expect(loadPlanState).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: 'create_campaign' }),
      expect.objectContaining({ accessToken: 'access' }),
      {},
      liveMutation
    )
  })

  it('validates, mutates once, and verifies a confirmed Search plan', async () => {
    const plan = {
      id: '44444444-4444-4444-8444-444444444444',
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      customerId: '1234567890',
      actorId: ACTOR_ID,
      source: 'mcp',
      toolName: 'google_ads.pause_campaign',
      resourceType: 'campaign',
      resourceName: 'customers/1234567890/campaigns/10',
      operation: 'pause_campaign',
      currentState: { resourceName: 'customers/1234567890/campaigns/10', status: 'ENABLED' },
      desiredState: { resourceName: 'customers/1234567890/campaigns/10', status: 'PAUSED' },
      currentStateFingerprint: hashGoogleAdsValue({
        resourceName: 'customers/1234567890/campaigns/10',
        status: 'ENABLED'
      }),
      diff: [{ field: 'status', before: 'ENABLED', after: 'PAUSED' }],
      providerOperations: [{
        service: 'campaigns',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{
          update: { resourceName: 'customers/1234567890/campaigns/10', status: 'PAUSED' },
          updateMask: 'status'
        }]
      }],
      riskTier: 'confirm',
      executionMode: 'proposal',
      policyVersion: 'google-ads-v1',
      policyDecision: { allowed: true, riskTier: 'confirm', executionMode: 'proposal' },
      requestHash: 'b'.repeat(64),
      idempotencyKey: 'pause-campaign-10',
      status: 'approved',
      expiresAt: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-08-31T00:00:00.000Z'
    } as GoogleAdsActionPlan
    const mutate = vi.fn()
      .mockResolvedValueOnce({ results: [], requestId: 'validate-request' })
      .mockResolvedValueOnce({ results: [{}], requestId: 'live-request' })
    const loadPlanState = vi.fn()
      .mockResolvedValueOnce(plan.currentState)
      .mockResolvedValueOnce(plan.desiredState)
    const complete = vi.fn().mockResolvedValue(plan)

    await expect(executeSearchGoogleAdsControlAction(plan, authority, flags, {
      resolveSession: vi.fn().mockResolvedValue({
        connection: {
          clientId: CLIENT_ID,
          connectionId: CONNECTION_ID,
          customerId: '1234567890',
          platform: 'google',
          status: 'active'
        },
        auth: { accessToken: 'access', developerToken: 'developer' }
      }),
      loadPlan: vi.fn().mockResolvedValue(plan),
      loadPlanState,
      loadAutomationPolicy: vi.fn().mockResolvedValue(null),
      mutate,
      claim: vi.fn().mockResolvedValue(plan),
      event: vi.fn().mockResolvedValue(undefined),
      complete
    })).resolves.toMatchObject({
      ok: true,
      status: 'verified',
      providerRequestId: 'live-request'
    })

    expect(mutate).toHaveBeenNthCalledWith(1, expect.objectContaining({ validateOnly: true }))
    expect(mutate).toHaveBeenNthCalledWith(2, expect.objectContaining({ validateOnly: false }))
    expect(mutate).toHaveBeenCalledTimes(2)
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ status: 'verified' }))
  })

  it('runs provider validation without claiming or applying the plan', async () => {
    const currentState = {
      resourceName: 'customers/1234567890/campaigns/10',
      status: 'ENABLED'
    }
    const plan = {
      id: '44444444-4444-4444-8444-444444444444',
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      customerId: '1234567890',
      actorId: ACTOR_ID,
      operation: 'pause_campaign',
      resourceType: 'campaign',
      resourceName: currentState.resourceName,
      currentState,
      currentStateFingerprint: hashGoogleAdsValue(currentState),
      providerOperations: [{
        service: 'campaigns',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{
          update: { resourceName: currentState.resourceName, status: 'PAUSED' },
          updateMask: 'status'
        }]
      }],
      diff: []
    } as GoogleAdsActionPlan
    const mutate = vi.fn().mockResolvedValue({ results: [], requestId: 'validate-request' })

    await expect(validateSearchGoogleAdsControlPlan(plan, {
      resolveSession: vi.fn().mockResolvedValue({
        connection: {
          clientId: CLIENT_ID,
          connectionId: CONNECTION_ID,
          customerId: '1234567890',
          platform: 'google',
          status: 'active'
        },
        auth: { accessToken: 'access', developerToken: 'developer' }
      }),
      loadPlanState: vi.fn().mockResolvedValue(currentState),
      mutate
    })).resolves.toMatchObject({
      valid: true,
      providerValidation: 'validate_only',
      providerRequestId: 'validate-request'
    })
    expect(mutate).toHaveBeenCalledOnce()
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ validateOnly: true }))
  })
})
