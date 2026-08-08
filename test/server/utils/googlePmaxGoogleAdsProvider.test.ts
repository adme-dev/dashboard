import { describe, expect, it, vi } from 'vitest'
import type {
  GooglePmaxGoogleAdsProviderError
} from '~~/server/utils/googlePmaxGoogleAdsProvider'
import {
  createGooglePmaxGoogleAdsProvider
} from '~~/server/utils/googlePmaxGoogleAdsProvider'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import { googlePmaxProviderNames } from '~~/server/utils/googlePmaxProviderMutations'

const config = {
  schemaVersion: 2,
  briefId: '23799282-283b-4508-b065-3fd36e8c05fd', briefVersion: 1,
  tenantId: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  connectionId: '4f1206a1-fec7-491f-beed-662d9e9fc904',
  customerId: '1234567890', campaignName: 'Northern GAC Vehicles',
  budget: {
    period: 'CUSTOM_PERIOD', allocatedTotal: 700, dailyBudget: null, currency: 'AUD',
    startDate: '2026-08-08', endDate: '2026-09-06', campaignDays: 30,
    calculatedDailyPace: 700 / 30,
    provider: { totalAmountMicros: '700000000', amountMicros: null }
  },
  bidding: { strategy: 'MAXIMIZE_CONVERSIONS' },
  schedule: { startDate: '2026-08-08', endDate: '2026-09-06' },
  locations: [{ criterionId: '1000567', displayName: 'Bundoora VIC' }],
  languages: ['en'], finalUrls: ['https://northerngac.com.au/new-vehicles/'],
  merchantCenterId: '5831245452',
  inventorySource: {
    providerId: 'social-dashboard', linkId: '7e8396fd-1515-4e5e-a364-3d7c3a3dc1ac',
    feedId: 'google-vehicles-au', platform: 'google'
  },
  inventoryFilter: { listingSource: 'SHOPPING', conditions: ['NEW'] },
  assetGroup: {
    mode: 'MERCHANT_ONLY', name: 'Northern GAC vehicles', businessName: '', headlines: [],
    longHeadlines: [], descriptions: [], imageAssetResourceNames: [], logoAssetResourceNames: [],
    youtubeVideoAssetResourceNames: []
  },
  conversionGoals: [{
    conversionActionId: '111', resourceName: 'customers/1234567890/conversionActions/111',
    category: 'SUBMIT_LEAD_FORM', origin: 'WEBSITE'
  }],
  approval: { required: true, complianceAcknowledged: true }
} satisfies GooglePmaxInventoryLaunchConfig

const connection = {
  id: config.connectionId, clientId: config.clientId, status: 'active' as const,
  customerId: config.customerId, accessToken: 'secret-access', developerToken: 'secret-developer',
  loginCustomerId: '9999999999'
}

const campaignResourceName = `customers/${config.customerId}/campaigns/101`
const budgetResourceName = `customers/${config.customerId}/campaignBudgets/102`
const assetGroupResourceName = `customers/${config.customerId}/assetGroups/103`
const customGoalResourceName = `customers/${config.customerId}/customConversionGoals/202`

function response(body: unknown, requestId: string) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-request-id': requestId }
  })
}

function dependencies(overrides: { assetGroupStatus?: string, assetGroupCampaign?: string } = {}) {
  const names = googlePmaxProviderNames(config)
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'))
    if (url.includes('/customConversionGoals:mutate')) {
      return response(body.validateOnly
        ? { results: [{}] }
        : { results: [{ resourceName: customGoalResourceName }] }, 'goal-request')
    }
    if (url.includes('/conversionGoalCampaignConfigs:mutate')) {
      return response({ results: [{ resourceName: `customers/${config.customerId}/conversionGoalCampaignConfigs/101` }] }, 'config-request')
    }
    return response(body.validateOnly
      ? { mutateOperationResponses: [] }
      : {
          mutateOperationResponses: [
            { campaignBudgetResult: { resourceName: budgetResourceName } },
            { campaignResult: { resourceName: campaignResourceName } },
            { assetGroupResult: { resourceName: assetGroupResourceName } }
          ]
        }, body.validateOnly ? 'validate-request' : 'create-request')
  })

  let campaignExists = false
  let goalExists = false
  const queryAds = vi.fn(async (_connection: unknown, query: string) => {
    if (query.includes('FROM language_constant')) return [{
      languageConstant: { code: 'en', resourceName: 'languageConstants/1000' }
    }]
    if (query.includes('FROM custom_conversion_goal')) return goalExists
      ? [{ customConversionGoal: {
          resourceName: customGoalResourceName,
          name: names.customGoalName,
          status: 'ENABLED',
          conversionActions: config.conversionGoals.map(goal => goal.resourceName)
        } }]
      : []
    if (query.includes('FROM campaign') && query.includes('campaign.name =')) {
      return campaignExists
        ? [{ campaign: {
            id: '101', resourceName: campaignResourceName, status: 'PAUSED',
            campaignBudget: budgetResourceName
          } }]
        : []
    }
    if (query.includes('FROM asset_group') && query.includes('asset_group.name =')) {
      return campaignExists
        ? [{ assetGroup: {
            resourceName: assetGroupResourceName,
            campaign: overrides.assetGroupCampaign || campaignResourceName,
            status: overrides.assetGroupStatus || 'PAUSED'
          } }]
        : []
    }
    if (query.includes('FROM campaign') && query.includes('campaign.resource_name =')) return [{
      campaign: {
        id: '101', resourceName: campaignResourceName, status: 'PAUSED',
        name: names.campaignName, advertisingChannelType: 'PERFORMANCE_MAX', campaignBudget: budgetResourceName,
        startDateTime: '20260808 00:00:00', endDateTime: '20260906 23:59:59',
        brandGuidelinesEnabled: false,
        shoppingSetting: { merchantId: config.merchantCenterId, listingType: 'VEHICLES' },
        maximizeConversions: {}
      },
      campaignBudget: {
        resourceName: budgetResourceName, period: 'CUSTOM_PERIOD', totalAmountMicros: '700000000'
      }
    }]
    if (query.includes('FROM asset_group_listing_group_filter')) return [
      { assetGroupListingGroupFilter: { type: 'SUBDIVISION', listingSource: 'SHOPPING' } },
      { assetGroupListingGroupFilter: { type: 'UNIT_INCLUDED', listingSource: 'SHOPPING', caseValue: { productCondition: { condition: 'NEW' } } } },
      { assetGroupListingGroupFilter: { type: 'UNIT_EXCLUDED', listingSource: 'SHOPPING', caseValue: { productCondition: { condition: 'USED' } } } },
      { assetGroupListingGroupFilter: { type: 'UNIT_EXCLUDED', listingSource: 'SHOPPING', caseValue: { productCondition: {} } } }
    ]
    if (query.includes('FROM asset_group')) return [{ assetGroup: {
      resourceName: assetGroupResourceName, name: names.assetGroupName, status: 'PAUSED',
      finalUrls: config.finalUrls, finalMobileUrls: config.finalUrls
    } }]
    if (query.includes('FROM campaign_criterion')) return [
      { campaignCriterion: { location: { geoTargetConstant: 'geoTargetConstants/1000567' } } },
      { campaignCriterion: { language: { languageConstant: 'languageConstants/1000' } } }
    ]
    if (query.includes('FROM conversion_goal_campaign_config')) return [{
      conversionGoalCampaignConfig: {
        customConversionGoal: customGoalResourceName, goalConfigLevel: 'CAMPAIGN'
      },
      customConversionGoal: {
        resourceName: customGoalResourceName,
        status: 'ENABLED', conversionActions: config.conversionGoals.map(goal => goal.resourceName)
      }
    }]
    throw new Error(`Unexpected GAQL: ${query}`)
  })

  return {
    fetch,
    queryAds,
    loadConnection: vi.fn().mockResolvedValue(connection),
    markCampaignCreated() { campaignExists = true },
    markGoalCreated() { goalExists = true },
    markExisting() {
      campaignExists = true
      goalExists = true
    }
  }
}

describe('Google PMax concrete Google Ads provider', () => {
  it('validateOnly checks both the exact goal and the identical paused campaign operations', async () => {
    const deps = dependencies()
    const provider = createGooglePmaxGoogleAdsProvider(deps)
    const result = await provider.validateCreate(config)

    expect(result.requestId).toBe('validate-request')
    const calls = deps.fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))
    expect(calls).toHaveLength(2)
    expect(calls.every(body => body.validateOnly === true)).toBe(true)
    expect(calls[1].mutateOperations[1].campaignOperation.create.status).toBe('PAUSED')
  })

  it('creates or reuses deterministic resources, binds the exact goal, and returns only after paused readback', async () => {
    const deps = dependencies()
    const originalFetch = deps.fetch.getMockImplementation()!
    deps.fetch.mockImplementation(async (...args) => {
      const result = await originalFetch(...args)
      const url = String(args[0])
      const body = JSON.parse(String(args[1]?.body || '{}'))
      if (url.includes('googleAds:mutate') && !body.validateOnly) deps.markCampaignCreated()
      if (url.includes('customConversionGoals:mutate') && !body.validateOnly) deps.markGoalCreated()
      return result
    })

    const provider = createGooglePmaxGoogleAdsProvider(deps)
    const resources = await provider.createPaused(config)
    expect(resources).toMatchObject({
      customerId: config.customerId, campaignResourceName, campaignId: '101',
      budgetResourceName, assetGroupResourceName, status: 'PAUSED'
    })
    const configCalls = deps.fetch.mock.calls.filter(([url]) => String(url).includes('/conversionGoalCampaignConfigs:mutate'))
    expect(configCalls).toHaveLength(2)
    expect(JSON.parse(String(configCalls[0][1]?.body))).toMatchObject({ validateOnly: true })
    expect(JSON.parse(String(configCalls[1][1]?.body))).toMatchObject({
      validateOnly: false,
      operations: [{ update: { customConversionGoal: customGoalResourceName } }]
    })

    const callCount = deps.fetch.mock.calls.length
    deps.markExisting()
    await provider.createPaused(config)
    const retryCalls = deps.fetch.mock.calls.slice(callCount)
    expect(retryCalls.some(([url]) => String(url).includes('googleAds:mutate'))).toBe(false)
  })

  it('verifies exact budget, schedule, Merchant, targeting, condition tree, and conversion actions', async () => {
    const deps = dependencies()
    deps.markExisting()
    const provider = createGooglePmaxGoogleAdsProvider(deps)
    const verification = await provider.verify(config, {
      customerId: config.customerId, campaignResourceName, campaignId: '101',
      budgetResourceName, assetGroupResourceName, status: 'PAUSED', requestId: null
    }, 'PAUSED')

    expect(verification).toMatchObject({
      status: 'PAUSED', matchesConfig: true,
      details: {
        listingType: 'VEHICLES', merchantCenterId: config.merchantCenterId,
        totalAmountMicros: '700000000', conversionActionsExact: true,
        inventoryConditionsExact: true
      }
    })
  })

  it('refuses to reuse an asset group that is active or belongs to another campaign', async () => {
    for (const overrides of [
      { assetGroupStatus: 'ENABLED' },
      { assetGroupCampaign: `customers/${config.customerId}/campaigns/999` }
    ]) {
      const deps = dependencies(overrides)
      deps.markExisting()
      const provider = createGooglePmaxGoogleAdsProvider(deps)

      await expect(provider.createPaused(config)).rejects.toMatchObject<Partial<GooglePmaxGoogleAdsProviderError>>({
        code: 'PMAX_PROVIDER_EXISTING_RESOURCE_CONFLICT'
      })
    }
  })

  it('uses a narrow status-only mutation for pause and activation', async () => {
    const deps = dependencies()
    const provider = createGooglePmaxGoogleAdsProvider(deps)
    const resources = {
      customerId: config.customerId, campaignResourceName, campaignId: '101',
      budgetResourceName, assetGroupResourceName, status: 'PAUSED' as const, requestId: null
    }
    await expect(provider.emergencyPause(resources, config)).resolves.toMatchObject({ status: 'PAUSED' })
    await expect(provider.enable(resources, config)).resolves.toMatchObject({ status: 'ENABLED' })
    const bodies = deps.fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))
    expect(bodies).toContainEqual(expect.objectContaining({
      mutateOperations: expect.arrayContaining([
        { campaignOperation: { update: { resourceName: campaignResourceName, status: 'PAUSED' }, updateMask: 'status' } },
        { assetGroupOperation: { update: { resourceName: assetGroupResourceName, status: 'PAUSED' }, updateMask: 'status' } }
      ])
    }))
    expect(bodies).toContainEqual(expect.objectContaining({
      mutateOperations: expect.arrayContaining([
        { campaignOperation: { update: { resourceName: campaignResourceName, status: 'ENABLED' }, updateMask: 'status' } },
        { assetGroupOperation: { update: { resourceName: assetGroupResourceName, status: 'ENABLED' }, updateMask: 'status' } }
      ])
    }))
  })
})
