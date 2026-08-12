import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import { hashCanonicalLaunchJson } from './googlePmaxLaunchHash'

const BUDGET_TEMP_ID = '-1'
const CAMPAIGN_TEMP_ID = '-2'
const ASSET_GROUP_TEMP_ID = '-3'
const ROOT_FILTER_TEMP_ID = '-4'

export interface GooglePmaxMutateOperation {
  campaignBudgetOperation?: { create: Record<string, unknown> }
  campaignOperation?: { create?: Record<string, unknown>, update?: Record<string, unknown>, updateMask?: string }
  assetGroupOperation?: { create?: Record<string, unknown>, update?: Record<string, unknown>, updateMask?: string }
  assetGroupListingGroupFilterOperation?: { create: Record<string, unknown> }
  campaignCriterionOperation?: { create: Record<string, unknown> }
}

export class GooglePmaxProviderMutationError extends Error {
  constructor(public readonly code:
    | 'PMAX_PROVIDER_ASSET_ROLES_UNSUPPORTED'
    | 'PMAX_PROVIDER_LANGUAGE_UNRESOLVED'
    | 'PMAX_PROVIDER_RESOURCE_INVALID') {
    super('The Google PMax provider mutation could not be constructed safely.')
    this.name = 'GooglePmaxProviderMutationError'
  }
}

function providerSuffix(config: GooglePmaxInventoryLaunchConfig): string {
  return hashCanonicalLaunchJson(config).slice(0, 12)
}

export function googlePmaxProviderNames(config: GooglePmaxInventoryLaunchConfig) {
  const suffix = providerSuffix(config)
  const tagged = (base: string, tag: string) => `${base.slice(0, Math.max(1, 255 - tag.length - 1))} ${tag}`
  const tag = `[XF-${suffix}]`
  return {
    campaignName: tagged(config.campaignName, tag),
    budgetName: tagged(`${config.campaignName} budget`, tag),
    assetGroupName: tagged(config.assetGroup.name, tag),
    customGoalName: `XeroFlow PMax ${tag}`
  }
}

function googleDateTime(date: string, endOfDay = false): string {
  return `${date.replaceAll('-', '')} ${endOfDay ? '23:59:59' : '00:00:00'}`
}

function resourceId(resourceName: string, expected: RegExp): string {
  const match = expected.exec(resourceName)
  if (!match?.[1]) throw new GooglePmaxProviderMutationError('PMAX_PROVIDER_RESOURCE_INVALID')
  return match[1]
}

function bidStrategy(config: GooglePmaxInventoryLaunchConfig): Record<string, unknown> {
  if (config.bidding.strategy === 'MAXIMIZE_CONVERSION_VALUE') {
    return {
      maximizeConversionValue: config.bidding.targetRoas
        ? { targetRoas: config.bidding.targetRoas }
        : {}
    }
  }
  return {
    maximizeConversions: config.bidding.targetCpaMicros
      ? { targetCpaMicros: config.bidding.targetCpaMicros }
      : {}
  }
}

function listingFilterOperations(
  config: GooglePmaxInventoryLaunchConfig,
  assetGroupResourceName: string
): GooglePmaxMutateOperation[] {
  const customerId = config.customerId
  const rootResourceName = `customers/${customerId}/assetGroupListingGroupFilters/${ASSET_GROUP_TEMP_ID}~${ROOT_FILTER_TEMP_ID}`
  const operation = (
    filterId: number,
    type: 'SUBDIVISION' | 'UNIT_INCLUDED' | 'UNIT_EXCLUDED',
    caseValue?: Record<string, unknown>
  ): GooglePmaxMutateOperation => ({
    assetGroupListingGroupFilterOperation: {
      create: {
        resourceName: `customers/${customerId}/assetGroupListingGroupFilters/${ASSET_GROUP_TEMP_ID}~-${filterId}`,
        assetGroup: assetGroupResourceName,
        type,
        listingSource: 'SHOPPING',
        ...(filterId === 4 ? {} : { parentListingGroupFilter: rootResourceName }),
        ...(caseValue ? { caseValue } : {})
      }
    }
  })

  const selected = new Set(config.inventoryFilter.conditions)
  return [
    operation(4, 'SUBDIVISION'),
    operation(5, selected.has('NEW') ? 'UNIT_INCLUDED' : 'UNIT_EXCLUDED', {
      productCondition: { condition: 'NEW' }
    }),
    operation(6, selected.has('USED') ? 'UNIT_INCLUDED' : 'UNIT_EXCLUDED', {
      productCondition: { condition: 'USED' }
    }),
    operation(7, 'UNIT_EXCLUDED', { productCondition: {} })
  ]
}

export function buildGooglePmaxCreateOperations(
  config: GooglePmaxInventoryLaunchConfig,
  languageResources: Readonly<Record<string, string>>
): GooglePmaxMutateOperation[] {
  if (config.assetGroup.mode !== 'MERCHANT_ONLY') {
    throw new GooglePmaxProviderMutationError('PMAX_PROVIDER_ASSET_ROLES_UNSUPPORTED')
  }
  const resolvedLanguages = config.languages.map((code) => {
    const resourceName = languageResources[code]
    if (!resourceName || !/^languageConstants\/\d+$/.test(resourceName)) {
      throw new GooglePmaxProviderMutationError('PMAX_PROVIDER_LANGUAGE_UNRESOLVED')
    }
    return resourceName
  })
  const customerId = config.customerId
  const names = googlePmaxProviderNames(config)
  const budgetResourceName = `customers/${customerId}/campaignBudgets/${BUDGET_TEMP_ID}`
  const campaignResourceName = `customers/${customerId}/campaigns/${CAMPAIGN_TEMP_ID}`
  const assetGroupResourceName = `customers/${customerId}/assetGroups/${ASSET_GROUP_TEMP_ID}`

  const operations: GooglePmaxMutateOperation[] = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budgetResourceName,
          name: names.budgetName,
          period: 'CUSTOM_PERIOD',
          totalAmountMicros: config.budget.provider.totalAmountMicros,
          deliveryMethod: 'STANDARD',
          explicitlyShared: false
        }
      }
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaignResourceName,
          name: names.campaignName,
          campaignBudget: budgetResourceName,
          status: 'PAUSED',
          advertisingChannelType: 'PERFORMANCE_MAX',
          ...bidStrategy(config),
          shoppingSetting: {
            merchantId: config.merchantCenterId,
            listingType: 'VEHICLES'
          },
          brandGuidelinesEnabled: false,
          startDateTime: googleDateTime(config.schedule.startDate),
          endDateTime: googleDateTime(config.schedule.endDate, true),
          containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'
        }
      }
    },
    {
      assetGroupOperation: {
        create: {
          resourceName: assetGroupResourceName,
          campaign: campaignResourceName,
          name: names.assetGroupName,
          finalUrls: config.finalUrls,
          finalMobileUrls: config.finalUrls,
          status: 'PAUSED'
        }
      }
    },
    ...listingFilterOperations(config, assetGroupResourceName),
    ...config.locations.map(location => ({
      campaignCriterionOperation: {
        create: {
          campaign: campaignResourceName,
          location: { geoTargetConstant: `geoTargetConstants/${location.criterionId}` }
        }
      }
    })),
    ...resolvedLanguages.map(languageConstant => ({
      campaignCriterionOperation: {
        create: {
          campaign: campaignResourceName,
          language: { languageConstant }
        }
      }
    }))
  ]
  return operations
}

export function buildGooglePmaxCustomGoalCreateBody(
  config: GooglePmaxInventoryLaunchConfig,
  validateOnly = false
) {
  return {
    operations: [{
      create: {
        name: googlePmaxProviderNames(config).customGoalName,
        conversionActions: config.conversionGoals.map(goal => goal.resourceName),
        status: 'ENABLED'
      }
    }],
    partialFailure: false,
    validateOnly
  }
}

export function buildGooglePmaxGoalConfigBody(
  config: GooglePmaxInventoryLaunchConfig,
  campaignResourceName: string,
  customGoalResourceName: string,
  validateOnly = false
) {
  const campaignId = resourceId(
    campaignResourceName,
    new RegExp(`^customers/${config.customerId}/campaigns/(\\d+)$`)
  )
  if (!new RegExp(`^customers/${config.customerId}/customConversionGoals/\\d+$`).test(customGoalResourceName)) {
    throw new GooglePmaxProviderMutationError('PMAX_PROVIDER_RESOURCE_INVALID')
  }
  return {
    operations: [{
      update: {
        resourceName: `customers/${config.customerId}/conversionGoalCampaignConfigs/${campaignId}`,
        campaign: campaignResourceName,
        customConversionGoal: customGoalResourceName
      },
      updateMask: 'customConversionGoal'
    }],
    partialFailure: false,
    validateOnly
  }
}

export function buildGooglePmaxDeliveryStatusBody(
  resources: Pick<import('~~/server/utils/googlePmaxPausedExecutor').GooglePmaxProviderResources,
    'customerId' | 'campaignResourceName' | 'assetGroupResourceName'>,
  status: 'PAUSED' | 'ENABLED'
) {
  if (
    !new RegExp(`^customers/${resources.customerId}/campaigns/\\d+$`).test(resources.campaignResourceName)
    || !new RegExp(`^customers/${resources.customerId}/assetGroups/\\d+$`).test(resources.assetGroupResourceName)
  ) {
    throw new GooglePmaxProviderMutationError('PMAX_PROVIDER_RESOURCE_INVALID')
  }
  return {
    mutateOperations: [
      { campaignOperation: {
        update: { resourceName: resources.campaignResourceName, status },
        updateMask: 'status'
      } },
      { assetGroupOperation: {
        update: { resourceName: resources.assetGroupResourceName, status },
        updateMask: 'status'
      } }
    ],
    partialFailure: false,
    validateOnly: false,
    responseContentType: 'RESOURCE_NAME_ONLY'
  }
}
