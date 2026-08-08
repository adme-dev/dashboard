import { describe, expect, it } from 'vitest'
import {
  buildGooglePmaxCreateOperations,
  buildGooglePmaxCustomGoalCreateBody,
  buildGooglePmaxGoalConfigBody,
  googlePmaxProviderNames,
  GooglePmaxProviderMutationError
} from '~~/server/utils/googlePmaxProviderMutations'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'

const config = {
  schemaVersion: 2,
  briefId: '23799282-283b-4508-b065-3fd36e8c05fd',
  briefVersion: 1,
  tenantId: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
  clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
  connectionId: '4f1206a1-fec7-491f-beed-662d9e9fc904',
  customerId: '1234567890',
  campaignName: 'Northern GAC Vehicles',
  budget: {
    period: 'CUSTOM_PERIOD', allocatedTotal: 700, dailyBudget: null,
    currency: 'AUD', startDate: '2026-08-08', endDate: '2026-09-06', campaignDays: 30,
    calculatedDailyPace: 700 / 30,
    provider: { totalAmountMicros: '700000000', amountMicros: null }
  },
  bidding: { strategy: 'MAXIMIZE_CONVERSIONS', targetCpaMicros: '12000000' },
  schedule: { startDate: '2026-08-08', endDate: '2026-09-06' },
  locations: [{ criterionId: '1000567', displayName: 'Bundoora VIC' }],
  languages: ['en'],
  finalUrls: ['https://northerngac.com.au/new-vehicles/'],
  merchantCenterId: '5831245452',
  inventorySource: {
    providerId: 'social-dashboard',
    linkId: '7e8396fd-1515-4e5e-a364-3d7c3a3dc1ac',
    feedId: 'google-vehicles-au',
    platform: 'google'
  },
  inventoryFilter: { listingSource: 'SHOPPING', conditions: ['NEW'] },
  assetGroup: {
    mode: 'MERCHANT_ONLY', name: 'Northern GAC vehicles', businessName: '',
    headlines: [], longHeadlines: [], descriptions: [],
    imageAssetResourceNames: [], logoAssetResourceNames: [], youtubeVideoAssetResourceNames: []
  },
  conversionGoals: [{
    conversionActionId: '111',
    resourceName: 'customers/1234567890/conversionActions/111',
    category: 'SUBMIT_LEAD_FORM', origin: 'WEBSITE'
  }],
  approval: { required: true, complianceAcknowledged: true }
} satisfies GooglePmaxInventoryLaunchConfig

describe('Google PMax provider mutation contracts', () => {
  it('builds a deterministic paused Vehicle Ads campaign with a custom-period total budget', () => {
    const names = googlePmaxProviderNames(config)
    const operations = buildGooglePmaxCreateOperations(config, {
      en: 'languageConstants/1000'
    })

    expect(names.campaignName).toMatch(/^Northern GAC Vehicles \[XF-[a-f0-9]{12}\]$/)
    expect(operations[0]).toEqual({
      campaignBudgetOperation: {
        create: expect.objectContaining({
          resourceName: 'customers/1234567890/campaignBudgets/-1',
          period: 'CUSTOM_PERIOD',
          totalAmountMicros: '700000000',
          explicitlyShared: false
        })
      }
    })
    expect(JSON.stringify(operations[0])).not.toContain('amountMicros')
    expect(operations[1]).toEqual({
      campaignOperation: {
        create: expect.objectContaining({
          resourceName: 'customers/1234567890/campaigns/-2',
          name: names.campaignName,
          status: 'PAUSED',
          advertisingChannelType: 'PERFORMANCE_MAX',
          campaignBudget: 'customers/1234567890/campaignBudgets/-1',
          startDateTime: '20260808 00:00:00',
          endDateTime: '20260906 23:59:59',
          shoppingSetting: { merchantId: '5831245452', listingType: 'VEHICLES' },
          maximizeConversions: { targetCpaMicros: '12000000' },
          containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'
        })
      }
    })
    expect(operations).toContainEqual({ campaignCriterionOperation: { create: {
      campaign: 'customers/1234567890/campaigns/-2',
      location: { geoTargetConstant: 'geoTargetConstants/1000567' }
    } } })
    expect(operations).toContainEqual({ campaignCriterionOperation: { create: {
      campaign: 'customers/1234567890/campaigns/-2',
      language: { languageConstant: 'languageConstants/1000' }
    } } })
  })

  it('creates an exact NEW/USED partition and excludes the unclassified remainder', () => {
    const operations = buildGooglePmaxCreateOperations(config, { en: 'languageConstants/1000' })
    const filters = operations
      .filter(operation => 'assetGroupListingGroupFilterOperation' in operation)
      .map(operation => operation.assetGroupListingGroupFilterOperation?.create)

    expect(filters).toEqual([
      expect.objectContaining({
        resourceName: 'customers/1234567890/assetGroupListingGroupFilters/-3~-4',
        type: 'SUBDIVISION', listingSource: 'SHOPPING'
      }),
      expect.objectContaining({
        parentListingGroupFilter: 'customers/1234567890/assetGroupListingGroupFilters/-3~-4',
        type: 'UNIT_INCLUDED', caseValue: { productCondition: { condition: 'NEW' } }
      }),
      expect.objectContaining({
        parentListingGroupFilter: 'customers/1234567890/assetGroupListingGroupFilters/-3~-4',
        type: 'UNIT_EXCLUDED', caseValue: { productCondition: { condition: 'USED' } }
      }),
      expect.objectContaining({
        parentListingGroupFilter: 'customers/1234567890/assetGroupListingGroupFilters/-3~-4',
        type: 'UNIT_EXCLUDED', caseValue: { productCondition: {} }
      })
    ])
  })

  it('builds exact conversion-action goal bodies without accepting a caller resource name', () => {
    const goal = buildGooglePmaxCustomGoalCreateBody(config)
    expect(goal).toEqual({
      operations: [{ create: {
        name: expect.stringMatching(/^XeroFlow PMax \[XF-[a-f0-9]{12}\]$/),
        conversionActions: ['customers/1234567890/conversionActions/111'],
        status: 'ENABLED'
      } }],
      partialFailure: false,
      validateOnly: false
    })

    expect(buildGooglePmaxGoalConfigBody(
      config,
      'customers/1234567890/campaigns/101',
      'customers/1234567890/customConversionGoals/202'
    )).toEqual({
      operations: [{
        update: {
          resourceName: 'customers/1234567890/conversionGoalCampaignConfigs/101',
          campaign: 'customers/1234567890/campaigns/101',
          customConversionGoal: 'customers/1234567890/customConversionGoals/202'
        },
        updateMask: 'customConversionGoal'
      }],
      partialFailure: false,
      validateOnly: false
    })
  })

  it('fails closed for unresolved languages and ambiguous manual asset roles', () => {
    expect(() => buildGooglePmaxCreateOperations(config, {})).toThrowError(
      expect.objectContaining({ code: 'PMAX_PROVIDER_LANGUAGE_UNRESOLVED' })
    )
    expect(() => buildGooglePmaxCreateOperations({
      ...config,
      assetGroup: { ...config.assetGroup, mode: 'PROVIDED' }
    }, { en: 'languageConstants/1000' })).toThrowError(
      expect.objectContaining({ code: 'PMAX_PROVIDER_ASSET_ROLES_UNSUPPORTED' })
    )
    expect(GooglePmaxProviderMutationError).toBeTypeOf('function')
  })
})
