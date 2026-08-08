import { z } from 'zod'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import type {
  GooglePmaxPausedProvider,
  GooglePmaxProviderResources,
  GooglePmaxProviderVerification
} from '~~/server/utils/googlePmaxPausedExecutor'
import type { GooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderReadback'
import {
  buildGooglePmaxCreateOperations,
  buildGooglePmaxCustomGoalCreateBody,
  buildGooglePmaxDeliveryStatusBody,
  buildGooglePmaxGoalConfigBody,
  googlePmaxProviderNames
} from './googlePmaxProviderMutations'

const GOOGLE_ADS_BASE = 'https://googleads.googleapis.com/v23'

const MutateResponseSchema = z.object({
  mutateOperationResponses: z.array(z.object({
    campaignBudgetResult: z.object({ resourceName: z.string() }).optional(),
    campaignResult: z.object({ resourceName: z.string() }).optional(),
    assetGroupResult: z.object({ resourceName: z.string() }).optional()
  }).passthrough()).optional(),
  results: z.array(z.object({ resourceName: z.string().optional() }).passthrough()).optional()
}).passthrough()

export interface GooglePmaxGoogleAdsProviderDependencies {
  fetch?: typeof globalThis.fetch
  loadConnection: (config: GooglePmaxInventoryLaunchConfig) => Promise<GooglePmaxProviderConnection>
  queryAds: (connection: GooglePmaxProviderConnection, query: string) => Promise<unknown[]>
}

interface MutateResult {
  payload: z.infer<typeof MutateResponseSchema>
  requestId: string | null
}

export class GooglePmaxGoogleAdsProviderError extends Error {
  constructor(public readonly code:
    | 'PMAX_PROVIDER_REQUEST_FAILED'
    | 'PMAX_PROVIDER_RESPONSE_INVALID'
    | 'PMAX_PROVIDER_EXISTING_RESOURCE_CONFLICT'
    | 'PMAX_PROVIDER_GOAL_CONFLICT'
    | 'PMAX_PROVIDER_READBACK_INVALID') {
    super('The Google Ads provider operation failed closed.')
    this.name = 'GooglePmaxGoogleAdsProviderError'
  }
}

function safeRequestId(response: Response): string | null {
  for (const header of ['request-id', 'x-request-id', 'x-goog-request-id']) {
    const value = response.headers.get(header)
    if (value && /^[A-Za-z0-9_.:-]{1,255}$/.test(value)) return value
  }
  return null
}

function headers(connection: GooglePmaxProviderConnection): Record<string, string> {
  return {
    'Authorization': `Bearer ${connection.accessToken}`,
    'developer-token': connection.developerToken,
    'Content-Type': 'application/json',
    ...(connection.loginCustomerId
      ? { 'login-customer-id': connection.loginCustomerId.replaceAll('-', '') }
      : {})
  }
}

function gaqlLiteral(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'')}'`
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function objectAt(value: unknown, key: string): Record<string, unknown> {
  return asRecord(asRecord(value)[key])
}

function stringAt(value: unknown, key: string): string {
  const result = asRecord(value)[key]
  return typeof result === 'string' ? result : ''
}

function stringArrayAt(value: unknown, key: string): string[] {
  const result = asRecord(value)[key]
  return Array.isArray(result) && result.every(item => typeof item === 'string') ? result : []
}

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function sameStrings(left: string[], right: string[]): boolean {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right))
}

function resourceId(resourceName: string, resourceType: string, customerId: string): string {
  const match = new RegExp(`^customers/${customerId}/${resourceType}/(\\d+)$`).exec(resourceName)
  if (!match?.[1]) throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_RESPONSE_INVALID')
  return match[1]
}

function expectedDateTime(date: string, end = false): string {
  return `${date.replaceAll('-', '')} ${end ? '23:59:59' : '00:00:00'}`
}

async function postJson(input: {
  fetcher: typeof globalThis.fetch
  connection: GooglePmaxProviderConnection
  url: string
  body: Record<string, unknown>
}): Promise<MutateResult> {
  let response: Response
  try {
    response = await input.fetcher(input.url, {
      method: 'POST',
      headers: headers(input.connection),
      body: JSON.stringify(input.body)
    })
  } catch {
    throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_REQUEST_FAILED')
  }
  if (!response.ok) throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_REQUEST_FAILED')
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_RESPONSE_INVALID')
  }
  const parsed = MutateResponseSchema.safeParse(payload)
  if (!parsed.success) throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_RESPONSE_INVALID')
  return { payload: parsed.data, requestId: safeRequestId(response) }
}

function languageResources(rows: unknown[], expectedCodes: string[]): Record<string, string> {
  const resources: Record<string, string> = {}
  for (const row of rows) {
    const language = objectAt(row, 'languageConstant')
    const code = stringAt(language, 'code')
    const resourceName = stringAt(language, 'resourceName')
    if (code && resourceName) resources[code] = resourceName
  }
  if (expectedCodes.some(code => !resources[code])) {
    throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_READBACK_INVALID')
  }
  return resources
}

function customGoalFromRows(
  rows: unknown[],
  config: GooglePmaxInventoryLaunchConfig
): string | null {
  if (rows.length > 1) throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_GOAL_CONFLICT')
  if (!rows.length) return null
  const goal = objectAt(rows[0], 'customConversionGoal')
  const resourceName = stringAt(goal, 'resourceName')
  if (
    !new RegExp(`^customers/${config.customerId}/customConversionGoals/\\d+$`).test(resourceName)
    || stringAt(goal, 'status') !== 'ENABLED'
    || !sameStrings(stringArrayAt(goal, 'conversionActions'), config.conversionGoals.map(item => item.resourceName))
  ) throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_GOAL_CONFLICT')
  return resourceName
}

function resourcesFromCreateResponse(
  config: GooglePmaxInventoryLaunchConfig,
  result: MutateResult
): GooglePmaxProviderResources {
  const responses = result.payload.mutateOperationResponses || []
  const campaignResourceName = responses
    .map(item => item.campaignResult?.resourceName).find(Boolean) || ''
  const budgetResourceName = responses
    .map(item => item.campaignBudgetResult?.resourceName).find(Boolean) || ''
  const assetGroupResourceName = responses
    .map(item => item.assetGroupResult?.resourceName).find(Boolean) || ''
  return {
    customerId: config.customerId,
    campaignResourceName,
    campaignId: resourceId(campaignResourceName, 'campaigns', config.customerId),
    budgetResourceName: budgetResourceName && resourceId(budgetResourceName, 'campaignBudgets', config.customerId)
      ? budgetResourceName
      : '',
    assetGroupResourceName: assetGroupResourceName && resourceId(assetGroupResourceName, 'assetGroups', config.customerId)
      ? assetGroupResourceName
      : '',
    status: 'PAUSED',
    requestId: result.requestId
  }
}

function resourcesFromExistingRows(
  config: GooglePmaxInventoryLaunchConfig,
  campaignRows: unknown[],
  assetGroupRows: unknown[]
): GooglePmaxProviderResources | null {
  if (!campaignRows.length && !assetGroupRows.length) return null
  if (campaignRows.length !== 1 || assetGroupRows.length !== 1) {
    throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_EXISTING_RESOURCE_CONFLICT')
  }
  const campaign = objectAt(campaignRows[0], 'campaign')
  const assetGroup = objectAt(assetGroupRows[0], 'assetGroup')
  const campaignResourceName = stringAt(campaign, 'resourceName')
  const budgetResourceName = stringAt(campaign, 'campaignBudget')
  const assetGroupResourceName = stringAt(assetGroup, 'resourceName')
  if (stringAt(campaign, 'status') !== 'PAUSED') {
    throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_EXISTING_RESOURCE_CONFLICT')
  }
  if (
    stringAt(assetGroup, 'status') !== 'PAUSED'
    || stringAt(assetGroup, 'campaign') !== campaignResourceName
  ) {
    throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_EXISTING_RESOURCE_CONFLICT')
  }
  resourceId(budgetResourceName, 'campaignBudgets', config.customerId)
  resourceId(assetGroupResourceName, 'assetGroups', config.customerId)
  return {
    customerId: config.customerId,
    campaignResourceName,
    campaignId: resourceId(campaignResourceName, 'campaigns', config.customerId),
    budgetResourceName,
    assetGroupResourceName,
    status: 'PAUSED',
    requestId: null
  }
}

function mutateResource(result: MutateResult, expected: RegExp): string {
  const resourceName = result.payload.results?.[0]?.resourceName || ''
  if (!expected.test(resourceName)) {
    throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_RESPONSE_INVALID')
  }
  return resourceName
}

export function createGooglePmaxGoogleAdsProvider(
  dependencies: GooglePmaxGoogleAdsProviderDependencies
): GooglePmaxPausedProvider {
  const fetcher = dependencies.fetch || globalThis.fetch
  const loadConnection = dependencies.loadConnection
  const queryAds = dependencies.queryAds

  async function context(config: GooglePmaxInventoryLaunchConfig) {
    const connection = await loadConnection(config)
    const codes = config.languages.map(gaqlLiteral).join(', ')
    const rows = await queryAds(connection, `
      SELECT language_constant.code, language_constant.resource_name
      FROM language_constant
      WHERE language_constant.code IN (${codes})
    `.trim())
    return { connection, languages: languageResources(rows, config.languages) }
  }

  async function findCustomGoal(
    connection: GooglePmaxProviderConnection,
    config: GooglePmaxInventoryLaunchConfig
  ): Promise<string | null> {
    const rows = await queryAds(connection, `
      SELECT custom_conversion_goal.resource_name, custom_conversion_goal.name,
             custom_conversion_goal.status, custom_conversion_goal.conversion_actions
      FROM custom_conversion_goal
      WHERE custom_conversion_goal.name = ${gaqlLiteral(googlePmaxProviderNames(config).customGoalName)}
    `.trim())
    return customGoalFromRows(rows, config)
  }

  async function findExistingResources(
    connection: GooglePmaxProviderConnection,
    config: GooglePmaxInventoryLaunchConfig
  ): Promise<GooglePmaxProviderResources | null> {
    const names = googlePmaxProviderNames(config)
    const [campaignRows, assetGroupRows] = await Promise.all([
      queryAds(connection, `
        SELECT campaign.id, campaign.resource_name, campaign.status, campaign.campaign_budget
        FROM campaign
        WHERE campaign.name = ${gaqlLiteral(names.campaignName)}
          AND campaign.status != 'REMOVED'
      `.trim()),
      queryAds(connection, `
        SELECT asset_group.resource_name, asset_group.campaign, asset_group.status
        FROM asset_group
        WHERE asset_group.name = ${gaqlLiteral(names.assetGroupName)}
          AND asset_group.status != 'REMOVED'
      `.trim())
    ])
    return resourcesFromExistingRows(config, campaignRows, assetGroupRows)
  }

  async function ensureCustomGoal(
    connection: GooglePmaxProviderConnection,
    config: GooglePmaxInventoryLaunchConfig
  ): Promise<string> {
    const existing = await findCustomGoal(connection, config)
    if (existing) return existing
    const result = await postJson({
      fetcher, connection,
      url: `${GOOGLE_ADS_BASE}/customers/${config.customerId}/customConversionGoals:mutate`,
      body: buildGooglePmaxCustomGoalCreateBody(config)
    })
    return mutateResource(
      result,
      new RegExp(`^customers/${config.customerId}/customConversionGoals/\\d+$`)
    )
  }

  async function configureGoal(
    connection: GooglePmaxProviderConnection,
    config: GooglePmaxInventoryLaunchConfig,
    resources: GooglePmaxProviderResources,
    customGoalResourceName: string
  ) {
    const url = `${GOOGLE_ADS_BASE}/customers/${config.customerId}/conversionGoalCampaignConfigs:mutate`
    await postJson({
      fetcher, connection, url,
      body: buildGooglePmaxGoalConfigBody(config, resources.campaignResourceName, customGoalResourceName, true)
    })
    return postJson({
      fetcher, connection, url,
      body: buildGooglePmaxGoalConfigBody(config, resources.campaignResourceName, customGoalResourceName)
    })
  }

  async function mutateStatus(
    resources: GooglePmaxProviderResources,
    config: GooglePmaxInventoryLaunchConfig,
    status: 'PAUSED' | 'ENABLED'
  ) {
    if (config.customerId !== resources.customerId) {
      throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_EXISTING_RESOURCE_CONFLICT')
    }
    const connection = await loadConnection(config)
    const result = await postJson({
      fetcher, connection,
      url: `${GOOGLE_ADS_BASE}/customers/${resources.customerId}/googleAds:mutate`,
      body: buildGooglePmaxDeliveryStatusBody(resources, status)
    })
    return { status, requestId: result.requestId }
  }

  return {
    async validateCreate(config) {
      const { connection, languages } = await context(config)
      if (!await findCustomGoal(connection, config)) {
        await postJson({
          fetcher, connection,
          url: `${GOOGLE_ADS_BASE}/customers/${config.customerId}/customConversionGoals:mutate`,
          body: buildGooglePmaxCustomGoalCreateBody(config, true)
        })
      }
      const result = await postJson({
        fetcher, connection,
        url: `${GOOGLE_ADS_BASE}/customers/${config.customerId}/googleAds:mutate`,
        body: {
          mutateOperations: buildGooglePmaxCreateOperations(config, languages),
          partialFailure: false,
          validateOnly: true,
          responseContentType: 'RESOURCE_NAME_ONLY'
        }
      })
      return { requestId: result.requestId }
    },

    async createPaused(config) {
      const { connection, languages } = await context(config)
      const customGoalResourceName = await ensureCustomGoal(connection, config)
      let resources = await findExistingResources(connection, config)
      if (!resources) {
        const result = await postJson({
          fetcher, connection,
          url: `${GOOGLE_ADS_BASE}/customers/${config.customerId}/googleAds:mutate`,
          body: {
            mutateOperations: buildGooglePmaxCreateOperations(config, languages),
            partialFailure: false,
            validateOnly: false,
            responseContentType: 'RESOURCE_NAME_ONLY'
          }
        })
        resources = resourcesFromCreateResponse(config, result)
      }
      const goalResult = await configureGoal(connection, config, resources, customGoalResourceName)
      const campaignRows = await queryAds(connection, `
        SELECT campaign.status
        FROM campaign
        WHERE campaign.resource_name = ${gaqlLiteral(resources.campaignResourceName)}
      `.trim())
      const status = stringAt(objectAt(campaignRows[0], 'campaign'), 'status')
      return {
        ...resources,
        // The executor treats every non-PAUSED readback as unsafe and immediately
        // attempts an emergency pause. Never coerce an unknown provider state to safe.
        status: status === 'PAUSED' ? 'PAUSED' : 'ENABLED',
        requestId: goalResult.requestId || resources.requestId
      }
    },

    async verify(config, resources, expectedStatus): Promise<GooglePmaxProviderVerification> {
      const { connection, languages } = await context(config)
      const [campaignRows, assetGroupRows, criterionRows, filterRows, goalRows] = await Promise.all([
        queryAds(connection, `
          SELECT campaign.id, campaign.resource_name, campaign.name, campaign.status,
                 campaign.advertising_channel_type, campaign.campaign_budget,
                 campaign.start_date_time, campaign.end_date_time,
                 campaign.shopping_setting.merchant_id, campaign.shopping_setting.listing_type,
                 campaign.brand_guidelines_enabled,
                 campaign.maximize_conversions.target_cpa_micros,
                 campaign.maximize_conversion_value.target_roas,
                 campaign_budget.resource_name, campaign_budget.period,
                 campaign_budget.total_amount_micros, campaign_budget.amount_micros
          FROM campaign
          WHERE campaign.resource_name = ${gaqlLiteral(resources.campaignResourceName)}
        `.trim()),
        queryAds(connection, `
          SELECT asset_group.resource_name, asset_group.name, asset_group.status,
                 asset_group.final_urls, asset_group.final_mobile_urls
          FROM asset_group
          WHERE asset_group.resource_name = ${gaqlLiteral(resources.assetGroupResourceName)}
        `.trim()),
        queryAds(connection, `
          SELECT campaign_criterion.location.geo_target_constant,
                 campaign_criterion.language.language_constant
          FROM campaign_criterion
          WHERE campaign_criterion.campaign = ${gaqlLiteral(resources.campaignResourceName)}
            AND campaign_criterion.negative = FALSE
        `.trim()),
        queryAds(connection, `
          SELECT asset_group_listing_group_filter.resource_name,
                 asset_group_listing_group_filter.type,
                 asset_group_listing_group_filter.listing_source,
                 asset_group_listing_group_filter.parent_listing_group_filter,
                 asset_group_listing_group_filter.case_value.product_condition.condition
          FROM asset_group_listing_group_filter
          WHERE asset_group_listing_group_filter.asset_group = ${gaqlLiteral(resources.assetGroupResourceName)}
        `.trim()),
        queryAds(connection, `
          SELECT conversion_goal_campaign_config.custom_conversion_goal,
                 conversion_goal_campaign_config.goal_config_level,
                 custom_conversion_goal.status,
                 custom_conversion_goal.conversion_actions
          FROM conversion_goal_campaign_config
          WHERE conversion_goal_campaign_config.campaign = ${gaqlLiteral(resources.campaignResourceName)}
        `.trim())
      ])
      if (
        campaignRows.length !== 1 || assetGroupRows.length !== 1 || goalRows.length !== 1
      ) throw new GooglePmaxGoogleAdsProviderError('PMAX_PROVIDER_READBACK_INVALID')

      const campaignRow = campaignRows[0]
      const campaign = objectAt(campaignRow, 'campaign')
      const budget = objectAt(campaignRow, 'campaignBudget')
      const shopping = objectAt(campaign, 'shoppingSetting')
      const assetGroup = objectAt(assetGroupRows[0], 'assetGroup')
      const goalConfig = objectAt(goalRows[0], 'conversionGoalCampaignConfig')
      const customGoal = objectAt(goalRows[0], 'customConversionGoal')
      const statusValue = stringAt(campaign, 'status')
      const status = ['PAUSED', 'ENABLED', 'REMOVED'].includes(statusValue)
        ? statusValue as 'PAUSED' | 'ENABLED' | 'REMOVED'
        : 'UNKNOWN'
      const locations = criterionRows.map(row => stringAt(objectAt(objectAt(row, 'campaignCriterion'), 'location'), 'geoTargetConstant')).filter(Boolean)
      const readLanguages = criterionRows.map(row => stringAt(objectAt(objectAt(row, 'campaignCriterion'), 'language'), 'languageConstant')).filter(Boolean)
      const conditions = filterRows.map(row => ({
        type: stringAt(objectAt(row, 'assetGroupListingGroupFilter'), 'type'),
        source: stringAt(objectAt(row, 'assetGroupListingGroupFilter'), 'listingSource'),
        condition: stringAt(objectAt(objectAt(objectAt(row, 'assetGroupListingGroupFilter'), 'caseValue'), 'productCondition'), 'condition')
      }))
      const expectedConditions = new Set(config.inventoryFilter.conditions)
      const conditionMatches = conditions.some(item => item.type === 'SUBDIVISION' && item.source === 'SHOPPING')
        && ['NEW', 'USED'].every(condition => conditions.some(item => (
          item.condition === condition
          && item.source === 'SHOPPING'
          && item.type === (expectedConditions.has(condition as 'NEW' | 'USED') ? 'UNIT_INCLUDED' : 'UNIT_EXCLUDED')
        ))) && conditions.some(item => !item.condition && item.type === 'UNIT_EXCLUDED')
      const conversionActionsExact = sameStrings(
        stringArrayAt(customGoal, 'conversionActions'),
        config.conversionGoals.map(goal => goal.resourceName)
      )
      const names = googlePmaxProviderNames(config)
      const campaignRecord = asRecord(campaign)
      const biddingMatches = config.bidding.strategy === 'MAXIMIZE_CONVERSIONS'
        ? 'maximizeConversions' in campaignRecord
        && String(asRecord(campaignRecord.maximizeConversions).targetCpaMicros || '') === (config.bidding.targetCpaMicros || '')
        && !('maximizeConversionValue' in campaignRecord)
        : 'maximizeConversionValue' in campaignRecord
          && Number(asRecord(campaignRecord.maximizeConversionValue).targetRoas || 0) === (config.bidding.targetRoas || 0)
          && !('maximizeConversions' in campaignRecord)
      const matchesConfig = status === expectedStatus
        && stringAt(campaign, 'name') === names.campaignName
        && stringAt(campaign, 'advertisingChannelType') === 'PERFORMANCE_MAX'
        && stringAt(campaign, 'campaignBudget') === resources.budgetResourceName
        && stringAt(campaign, 'startDateTime') === expectedDateTime(config.schedule.startDate)
        && stringAt(campaign, 'endDateTime') === expectedDateTime(config.schedule.endDate, true)
        && String(asRecord(shopping).merchantId || '') === config.merchantCenterId
        && stringAt(shopping, 'listingType') === 'VEHICLES'
        && asRecord(campaign).brandGuidelinesEnabled === false
        && biddingMatches
        && stringAt(budget, 'resourceName') === resources.budgetResourceName
        && stringAt(budget, 'period') === 'CUSTOM_PERIOD'
        && String(asRecord(budget).totalAmountMicros || '') === config.budget.provider.totalAmountMicros
        && !asRecord(budget).amountMicros
        && stringAt(assetGroup, 'resourceName') === resources.assetGroupResourceName
        && stringAt(assetGroup, 'name') === names.assetGroupName
        && stringAt(assetGroup, 'status') === expectedStatus
        && sameStrings(stringArrayAt(assetGroup, 'finalUrls'), config.finalUrls)
        && sameStrings(stringArrayAt(assetGroup, 'finalMobileUrls'), config.finalUrls)
        && sameStrings(locations, config.locations.map(item => `geoTargetConstants/${item.criterionId}`))
        && sameStrings(readLanguages, Object.values(languages))
        && conditionMatches
        && stringAt(goalConfig, 'goalConfigLevel') === 'CAMPAIGN'
        && stringAt(goalConfig, 'customConversionGoal') === stringAt(customGoal, 'resourceName')
        && stringAt(customGoal, 'status') === 'ENABLED'
        && conversionActionsExact
      return {
        status,
        matchesConfig,
        requestId: null,
        details: {
          listingType: stringAt(shopping, 'listingType'),
          merchantCenterId: String(asRecord(shopping).merchantId || ''),
          totalAmountMicros: String(asRecord(budget).totalAmountMicros || ''),
          conversionActionsExact,
          inventoryConditionsExact: conditionMatches,
          locationsExact: sameStrings(locations, config.locations.map(item => `geoTargetConstants/${item.criterionId}`)),
          languagesExact: sameStrings(readLanguages, Object.values(languages))
        }
      }
    },

    emergencyPause(resources, config) {
      return mutateStatus(resources, config, 'PAUSED')
    },

    enable(resources, config) {
      return mutateStatus(resources, config, 'ENABLED')
    }
  }
}
