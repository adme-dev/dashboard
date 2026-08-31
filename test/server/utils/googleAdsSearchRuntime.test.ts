import { describe, expect, it, vi } from 'vitest'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import { hashGoogleAdsValue } from '~~/server/utils/googleAds/actionPlanner'
import {
  executeSearchGoogleAdsControlAction,
  isExecutableSearchGoogleAdsPlan,
  loadGoogleAdsAutomationPolicy,
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
  it('counts UTC-day quota reservations when loading an automation grant', async () => {
    const queryOne = vi.fn().mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      actionClass: 'pause',
      policyVersion: 'pause-v2',
      enabled: true,
      conditions: {},
      maxDailyActions: 10,
      actionsToday: 4
    })

    await expect(loadGoogleAdsAutomationPolicy({
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      customerId: '1234567890',
      actionClass: 'pause'
    }, { queryOne })).resolves.toMatchObject({ actionsToday: 4 })

    const [sql, params] = queryOne.mock.calls[0]!
    expect(sql).toContain('google_ads_automation_quota_reservations')
    expect(sql).toContain('AT TIME ZONE \'UTC\'')
    expect(sql).toContain('NOT EXISTS')
    expect(params).toEqual([CLIENT_ID, CONNECTION_ID, '1234567890', 'pause'])
  })

  it.each([
    ['manage_custom_audience', 'customAudiences'],
    ['archive_custom_audience', 'customAudiences'],
    ['set_pmax_signals', 'assetGroupSignals'],
    ['set_search_themes', 'assetGroupSignals']
  ] as const)('allows governed %s plans only through %s', (operation, service) => {
    expect(isExecutableSearchGoogleAdsPlan({
      operation,
      providerOperations: [{ service, operations: [{ create: {} }] }]
    } as GoogleAdsActionPlan)).toBe(true)
    expect(isExecutableSearchGoogleAdsPlan({
      operation,
      providerOperations: [{ service: 'campaigns', operations: [{ create: {} }] }]
    } as GoogleAdsActionPlan)).toBe(false)
  })

  it.each([
    ['remove_campaign', 'campaigns'],
    ['remove_ad_group', 'adGroups'],
    ['remove_ad', 'adGroupAds'],
    ['remove_keyword', 'adGroupCriteria']
  ] as const)('allows typed %s plans only through %s', (operation, service) => {
    expect(isExecutableSearchGoogleAdsPlan({
      operation,
      providerOperations: [{ service, operations: [{ remove: 'resource' }] }]
    } as GoogleAdsActionPlan)).toBe(true)
    expect(isExecutableSearchGoogleAdsPlan({
      operation,
      providerOperations: [{ service: 'campaignBudgets', operations: [{ remove: 'resource' }] }]
    } as GoogleAdsActionPlan)).toBe(false)
  })

  it('allows only the typed mutable campaign fields through campaign updates', () => {
    const resourceName = 'customers/1234567890/campaigns/10'
    const basePlan = {
      customerId: '1234567890',
      operation: 'update_campaign',
      resourceName,
      currentState: { resourceName, name: 'Old' },
      desiredState: { resourceName, name: 'New' },
      providerOperations: [{
        service: 'campaigns',
        operations: [{ update: { resourceName, name: 'New' }, updateMask: 'name' }]
      }]
    } as GoogleAdsActionPlan
    expect(isExecutableSearchGoogleAdsPlan(basePlan)).toBe(true)
    expect(isExecutableSearchGoogleAdsPlan({
      ...basePlan,
      desiredState: { resourceName, advertisingChannelType: 'VIDEO' },
      providerOperations: [{
        service: 'campaigns',
        operations: [{
          update: { resourceName, advertisingChannelType: 'VIDEO' },
          updateMask: 'advertising_channel_type'
        }]
      }]
    } as GoogleAdsActionPlan)).toBe(false)
  })

  it.each([
    {
      operation: 'update_ad_group',
      service: 'adGroups',
      segment: 'adGroups',
      resourceName: 'customers/1234567890/adGroups/20',
      field: 'cpcBidMicros',
      mask: 'cpc_bid_micros',
      before: '1000000',
      after: '2000000'
    },
    {
      operation: 'update_keyword',
      service: 'adGroupCriteria',
      segment: 'adGroupCriteria',
      resourceName: 'customers/1234567890/adGroupCriteria/20~40',
      field: 'finalUrls',
      mask: 'final_urls',
      before: ['https://example.com/old'],
      after: ['https://example.com/new']
    }
  ] as const)('allows only typed fields through $operation', ({
    operation, service, resourceName, field, mask, before, after
  }) => {
    const plan = {
      customerId: '1234567890',
      operation,
      resourceName,
      currentState: { resourceName, [field]: before },
      desiredState: { resourceName, [field]: after },
      providerOperations: [{
        service,
        operations: [{ update: { resourceName, [field]: after }, updateMask: mask }]
      }]
    } as GoogleAdsActionPlan
    expect(isExecutableSearchGoogleAdsPlan(plan)).toBe(true)
    expect(isExecutableSearchGoogleAdsPlan({
      ...plan,
      providerOperations: [{ service: 'assets', operations: plan.providerOperations[0]!.operations }]
    } as GoogleAdsActionPlan)).toBe(false)
  })

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

  it('fails closed when the automatic-action daily quota is exhausted', async () => {
    const deps = dependencies({
      loadAutomationPolicy: vi.fn().mockResolvedValue({
        id: '55555555-5555-4555-8555-555555555555',
        actionClass: 'pause',
        policyVersion: 'pause-v2',
        enabled: true,
        conditions: {},
        maxDailyActions: 10,
        actionsToday: 10
      })
    })

    await expect(planSearchGoogleAdsControlAction({
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      actorId: ACTOR_ID,
      source: 'automation',
      operation: 'pause_campaign',
      resourceType: 'campaign',
      requestedMode: 'automatic',
      arguments: { resourceName: 'customers/1234567890/campaigns/10' },
      idempotencyKey: 'quota-exhausted-pause-campaign-10'
    }, authority, flags, deps)).resolves.toMatchObject({
      status: 'cancelled',
      executionMode: 'blocked',
      policyDecision: { allowed: false }
    })
  })

  it('records the operator reason on destructive-plan audit evidence', async () => {
    const resourceName = 'customers/1234567890/conversionActions/9001'
    const reason = 'Duplicate conversion action retired after measurement QA.'
    const deps = dependencies({
      loadCurrent: vi.fn().mockResolvedValue({
        resourceName,
        name: 'Duplicate finance enquiry',
        status: 'ENABLED',
        type: 'WEBPAGE',
        category: 'SUBMIT_LEAD_FORM',
        origin: 'WEBSITE',
        primaryForGoal: false,
        includeInConversionsMetric: false
      })
    })

    await planSearchGoogleAdsControlAction({
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      actorId: ACTOR_ID,
      source: 'mcp',
      operation: 'remove_conversion_action',
      resourceType: 'conversion_action',
      requestedMode: 'proposal',
      arguments: { resourceName, reason },
      idempotencyKey: 'remove-duplicate-conversion-action-9001'
    }, { actorRole: 'owner', hasWriteScope: true }, { ...flags, destructive: true }, deps)

    expect(deps.event).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'planned',
      metadata: expect.objectContaining({ reason })
    }))
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

  it('bounds automatic asset-link archive by scope and resource allowlists', async () => {
    const resourceName = 'customers/1234567890/campaignAssets/60~9201~CALL'
    const deps = dependencies({
      loadCurrent: vi.fn().mockResolvedValue({
        resourceName,
        scope: 'campaign',
        parentResourceName: 'customers/1234567890/campaigns/60',
        assetResourceName: 'customers/1234567890/assets/9201',
        fieldType: 'CALL',
        status: 'ENABLED'
      }),
      loadAutomationPolicy: vi.fn().mockResolvedValue({
        id: '55555555-5555-4555-8555-555555555555',
        actionClass: 'asset_detachment',
        policyVersion: 'asset-archive-v1',
        enabled: true,
        conditions: { allowedScopes: ['campaign'], resourceNames: [resourceName] },
        maxDailyActions: 10,
        actionsToday: 1
      })
    })
    const input = {
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      actorId: ACTOR_ID,
      source: 'automation' as const,
      operation: 'archive_asset_link' as const,
      resourceType: 'asset_link' as const,
      requestedMode: 'automatic' as const,
      arguments: { scope: 'campaign', resourceName },
      idempotencyKey: 'archive-campaign-call-link'
    }
    await expect(planSearchGoogleAdsControlAction(input, authority, flags, deps)).resolves.toMatchObject({
      grantId: '55555555-5555-4555-8555-555555555555',
      riskTier: 'automatic',
      executionMode: 'automatic',
      status: 'planned'
    })

    deps.loadAutomationPolicy.mockResolvedValueOnce({
      id: '55555555-5555-4555-8555-555555555555',
      actionClass: 'asset_detachment',
      policyVersion: 'asset-archive-v1',
      enabled: true,
      conditions: { allowedScopes: ['ad_group'], resourceNames: [resourceName] },
      maxDailyActions: 10,
      actionsToday: 1
    })
    await expect(planSearchGoogleAdsControlAction({
      ...input,
      idempotencyKey: 'blocked-archive-campaign-call-link'
    }, authority, flags, deps)).resolves.toMatchObject({
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
    ['set_ad_schedule', 'campaignCriteria'],
    ['set_devices', 'campaignCriteria'],
    ['set_demographics', 'adGroupCriteria'],
    ['set_placements', 'campaignCriteria'],
    ['set_placements', 'adGroupCriteria'],
    ['set_content_exclusions', 'campaignCriteria'],
    ['set_audience_associations', 'adGroups'],
    ['set_audience_associations', 'adGroupCriteria'],
    ['set_campaign_conversion_goals', 'campaignConversionGoals'],
    ['set_conversion_goal', 'conversionGoalCampaignConfigs'],
    ['set_customer_goal_biddability', 'customerConversionGoals'],
    ['set_conversion_primary_state', 'conversionActions'],
    ['create_conversion_action', 'conversionActions'],
    ['update_conversion_action', 'conversionActions'],
    ['archive_conversion_action', 'conversionActions'],
    ['remove_conversion_action', 'conversionActions'],
    ['create_custom_conversion_goal', 'customConversionGoals'],
    ['update_custom_conversion_goal', 'customConversionGoals'],
    ['archive_custom_conversion_goal', 'customConversionGoals'],
    ['create_asset', 'assets']
  ] as const)('activates governed execution for %s', (operation, service) => {
    expect(isExecutableSearchGoogleAdsPlan({
      operation,
      providerOperations: [{ service }]
    } as GoogleAdsActionPlan)).toBe(true)
  })

  it('activates an ordered multi-service audience plan', () => {
    expect(isExecutableSearchGoogleAdsPlan({
      operation: 'set_audience_associations',
      providerOperations: [{ service: 'adGroups' }, { service: 'adGroupCriteria' }]
    } as GoogleAdsActionPlan)).toBe(true)
  })

  it('activates only the typed heterogeneous bundle used to create a Performance Max asset group', () => {
    const resourceName = 'customers/1234567890/assetGroups/-1'
    const valid = {
      operation: 'create_asset_group',
      customerId: '1234567890',
      desiredState: {
        campaign: 'customers/1234567890/campaigns/60',
        assets: [{
          fieldType: 'HEADLINE',
          assetResourceName: 'customers/1234567890/assets/7001'
        }]
      },
      providerOperations: [{
        service: 'googleAds',
        operations: [
          { mutate: { assetGroupOperation: { create: {
            resourceName,
            campaign: 'customers/1234567890/campaigns/60',
            status: 'PAUSED'
          } } } },
          { mutate: { assetGroupAssetOperation: { create: {
            assetGroup: resourceName,
            asset: 'customers/1234567890/assets/7001',
            fieldType: 'HEADLINE'
          } } } }
        ]
      }]
    } as GoogleAdsActionPlan
    expect(isExecutableSearchGoogleAdsPlan(valid)).toBe(true)
    expect(isExecutableSearchGoogleAdsPlan({
      ...valid,
      providerOperations: [{
        service: 'googleAds',
        operations: [{ mutate: { campaignOperation: { remove: 'customers/1234567890/campaigns/60' } } }]
      }]
    } as GoogleAdsActionPlan)).toBe(false)
    expect(isExecutableSearchGoogleAdsPlan({
      ...valid,
      desiredState: {
        campaign: 'customers/9999999999/campaigns/60',
        assets: []
      }
    } as GoogleAdsActionPlan)).toBe(false)
  })

  it('activates only a bounded asset-group update and rejects provider removal', () => {
    const resourceName = 'customers/1234567890/assetGroups/7001'
    const valid = {
      operation: 'update_asset_group',
      customerId: '1234567890',
      desiredState: {
        resourceName,
        campaign: 'customers/1234567890/campaigns/60',
        name: 'Paused SUV range',
        finalUrls: ['https://example.com/suv'],
        finalMobileUrls: [],
        status: 'PAUSED',
        assets: []
      },
      providerOperations: [{
        service: 'assetGroups',
        operations: [{
          update: { resourceName, name: 'Paused SUV range', status: 'PAUSED' },
          updateMask: 'name,path1,status'
        }]
      }]
    } as GoogleAdsActionPlan
    expect(isExecutableSearchGoogleAdsPlan(valid)).toBe(true)
    expect(isExecutableSearchGoogleAdsPlan({
      ...valid,
      providerOperations: [{ service: 'assetGroups', operations: [{ remove: resourceName }] }]
    } as GoogleAdsActionPlan)).toBe(false)
    expect(isExecutableSearchGoogleAdsPlan({
      ...valid,
      providerOperations: [{
        service: 'assetGroups',
        operations: [{
          update: { resourceName, campaign: 'customers/9999999999/campaigns/90' },
          updateMask: 'campaign'
        }]
      }]
    } as GoogleAdsActionPlan)).toBe(false)
  })

  it('accepts only the exact tenant-bound asset-group membership replacement', () => {
    const assetGroupResourceName = 'customers/1234567890/assetGroups/7001'
    const plan = {
      operation: 'manage_asset_group_assets',
      customerId: '1234567890',
      currentState: {
        assetGroup: {
          resourceName: assetGroupResourceName,
          assets: [{
            fieldType: 'HEADLINE', assetResourceName: 'customers/1234567890/assets/7003'
          }]
        }
      },
      desiredState: {
        assetGroupResourceName,
        assets: [{
          fieldType: 'HEADLINE', assetResourceName: 'customers/1234567890/assets/7013'
        }]
      },
      providerOperations: [{
        service: 'assetGroupAssets',
        operations: [
          { create: {
            assetGroup: assetGroupResourceName,
            asset: 'customers/1234567890/assets/7013',
            fieldType: 'HEADLINE'
          } },
          { remove: 'customers/1234567890/assetGroupAssets/7001~7003~HEADLINE' }
        ]
      }]
    } as GoogleAdsActionPlan
    expect(isExecutableSearchGoogleAdsPlan(plan)).toBe(true)
    expect(isExecutableSearchGoogleAdsPlan({
      ...plan,
      providerOperations: [{ service: 'assets' }]
    } as GoogleAdsActionPlan)).toBe(false)
    expect(isExecutableSearchGoogleAdsPlan({
      ...plan,
      providerOperations: [{
        service: 'assetGroupAssets',
        operations: [{ remove: 'customers/9999999999/assetGroupAssets/7001~7003~HEADLINE' }]
      }]
    } as GoogleAdsActionPlan)).toBe(false)
  })

  it('accepts only the exact tenant-bound listing-group tree replacement', () => {
    const assetGroupResourceName = 'customers/1234567890/assetGroups/7001'
    const root = 'customers/1234567890/assetGroupListingGroupFilters/7001~-1'
    const plan = {
      operation: 'manage_listing_groups',
      customerId: '1234567890',
      currentState: {
        assetGroup: { resourceName: assetGroupResourceName },
        filters: []
      },
      desiredState: {
        assetGroupResourceName,
        nodes: [{ path: [], type: 'UNIT_INCLUDED' }]
      },
      providerOperations: [{
        service: 'googleAds',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ mutate: { assetGroupListingGroupFilterOperation: { create: {
          resourceName: root,
          assetGroup: assetGroupResourceName,
          type: 'UNIT_INCLUDED',
          listingSource: 'SHOPPING'
        } } } }]
      }]
    } as GoogleAdsActionPlan
    expect(isExecutableSearchGoogleAdsPlan(plan)).toBe(true)
    expect(isExecutableSearchGoogleAdsPlan({
      ...plan,
      providerOperations: [{ service: 'assetGroupListingGroupFilters', operations: [] }]
    } as GoogleAdsActionPlan)).toBe(false)
    expect(isExecutableSearchGoogleAdsPlan({
      ...plan,
      providerOperations: [{
        service: 'googleAds',
        operations: [{ mutate: { campaignOperation: { remove: assetGroupResourceName } } }]
      }]
    } as GoogleAdsActionPlan)).toBe(false)
  })

  it.each([
    ['apply_recommendation', 'recommendationsApply', 'APPLIED'],
    ['dismiss_recommendation', 'recommendationsDismiss', 'DISMISSED']
  ] as const)('accepts only exact %s recommendation envelopes', (operation, service, disposition) => {
    const resourceName = 'customers/1234567890/recommendations/abc-1'
    const currentState = { resourceName, type: 'KEYWORD', dismissed: false, campaigns: [] }
    const plan = {
      operation,
      customerId: '1234567890',
      resourceName,
      currentState,
      desiredState: {
        ...currentState,
        dismissed: operation === 'dismiss_recommendation',
        disposition
      },
      providerOperations: [{
        service,
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ recommendation: { resourceName } }]
      }]
    } as GoogleAdsActionPlan
    expect(isExecutableSearchGoogleAdsPlan(plan)).toBe(true)
    expect(isExecutableSearchGoogleAdsPlan({
      ...plan,
      providerOperations: [{
        ...plan.providerOperations[0],
        operations: [{ recommendation: {
          resourceName: 'customers/9999999999/recommendations/abc-1'
        } }]
      }]
    } as GoogleAdsActionPlan)).toBe(false)
    const crossCustomerState = {
      ...currentState,
      campaign: 'customers/9999999999/campaigns/60'
    }
    expect(isExecutableSearchGoogleAdsPlan({
      ...plan,
      currentState: crossCustomerState,
      desiredState: {
        ...crossCustomerState,
        dismissed: operation === 'dismiss_recommendation',
        disposition
      }
    } as GoogleAdsActionPlan)).toBe(false)
  })

  it.each([
    ['customer', 'customerAssets'],
    ['campaign', 'campaignAssets'],
    ['ad_group', 'adGroupAssets']
  ] as const)('binds %s asset-link plans to the matching provider service', (scope, service) => {
    for (const operation of ['attach_asset', 'archive_asset_link', 'detach_asset'] as const) {
      expect(isExecutableSearchGoogleAdsPlan({
        operation,
        desiredState: { scope },
        providerOperations: [{ service }]
      } as GoogleAdsActionPlan)).toBe(true)
      expect(isExecutableSearchGoogleAdsPlan({
        operation,
        desiredState: { scope },
        providerOperations: [{ service: scope === 'campaign' ? 'customerAssets' : 'campaignAssets' }]
      } as GoogleAdsActionPlan)).toBe(false)
    }
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

  it('validates every audience service before starting ordered live writes', async () => {
    const currentState = {
      adGroupResourceName: 'customers/1234567890/adGroups/20',
      audienceGrouped: true,
      targetRestrictions: [{ targetingDimension: 'AUDIENCE', bidOnly: false }],
      associations: []
    }
    const desiredState = {
      ...currentState,
      targetRestrictions: [{ targetingDimension: 'AUDIENCE', bidOnly: true }],
      associations: [{ audienceResourceName: 'customers/1234567890/audiences/701' }]
    }
    const plan = {
      id: '44444444-4444-4444-8444-444444444444',
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      customerId: '1234567890',
      actorId: ACTOR_ID,
      source: 'mcp',
      toolName: 'google_ads.set_audience_associations',
      resourceType: 'audience',
      resourceName: currentState.adGroupResourceName,
      operation: 'set_audience_associations',
      currentState,
      desiredState,
      currentStateFingerprint: hashGoogleAdsValue(currentState),
      diff: [],
      providerOperations: [
        {
          service: 'adGroups', atomicity: 'interdependent', partialFailure: false,
          operations: [{ update: { resourceName: currentState.adGroupResourceName }, updateMask: 'targeting_setting.target_restrictions' }]
        },
        {
          service: 'adGroupCriteria', atomicity: 'interdependent', partialFailure: false,
          operations: [{ create: { adGroup: currentState.adGroupResourceName } }]
        }
      ],
      riskTier: 'rich_confirm',
      executionMode: 'proposal',
      policyVersion: 'google-ads-v1',
      policyDecision: { allowed: true, riskTier: 'rich_confirm', executionMode: 'proposal' },
      requestHash: 'b'.repeat(64),
      idempotencyKey: 'audience-20',
      status: 'approved',
      expiresAt: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-08-31T00:00:00.000Z'
    } as GoogleAdsActionPlan
    const mutate = vi.fn()
      .mockResolvedValueOnce({ results: [], requestId: 'validate-ad-group' })
      .mockResolvedValueOnce({ results: [], requestId: 'validate-criteria' })
      .mockResolvedValueOnce({ results: [{}], requestId: 'live-ad-group' })
      .mockResolvedValueOnce({ results: [{}], requestId: 'live-criteria' })
    const loadPlanState = vi.fn().mockResolvedValueOnce(currentState).mockResolvedValueOnce(desiredState)

    await expect(executeSearchGoogleAdsControlAction(plan, {
      actorRole: 'admin', hasWriteScope: true
    }, flags, {
      resolveSession: vi.fn().mockResolvedValue({
        connection: { clientId: CLIENT_ID, connectionId: CONNECTION_ID, customerId: '1234567890', platform: 'google', status: 'active' },
        auth: { accessToken: 'access', developerToken: 'developer' }
      }),
      loadPlan: vi.fn().mockResolvedValue(plan),
      loadPlanState,
      loadAutomationPolicy: vi.fn().mockResolvedValue(null),
      mutate,
      claim: vi.fn().mockResolvedValue(plan),
      event: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(plan)
    })).resolves.toMatchObject({ ok: true, status: 'verified' })
    expect(mutate.mock.calls.map(call => [call[0].service, call[0].validateOnly])).toEqual([
      ['adGroups', true],
      ['adGroupCriteria', true],
      ['adGroups', false],
      ['adGroupCriteria', false]
    ])
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
