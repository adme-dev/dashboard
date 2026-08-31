import { z } from 'zod'
import type { BuildGoogleAdsActionContext } from '~~/server/utils/googleAds/actionPlanner'
import { diffGoogleAdsStates } from '~~/server/utils/googleAds/actionPlanner'
import type {
  GoogleAdsActionPlan,
  GoogleAdsVerificationDiff
} from '~~/server/utils/googleAds/contracts'
import type { GoogleAdsAuth } from '~~/server/utils/googleAds/api'
import type { GoogleAdsMutateResult } from '~~/server/utils/googleAds/mutate'
import {
  executeGoogleAdsQuery,
  type ExecuteGoogleAdsQueryInput
} from '~~/server/utils/googleAds/query'
import { parseSearchGoogleAdsArguments } from '~~/server/utils/googleAds/searchOperations'

interface SearchStateDependencies {
  query(input: ExecuteGoogleAdsQueryInput): Promise<{ rows: unknown[], more: number }>
}

const defaultDependencies: SearchStateDependencies = {
  query: input => executeGoogleAdsQuery(input)
}

const StatusArgumentsSchema = z.object({ resourceName: z.string() })
const NegativeArgumentsSchema = z.object({
  scope: z.enum(['campaign', 'ad_group']),
  parentResourceName: z.string()
})
const CriterionSchema = z.object({
  text: z.string(),
  matchType: z.enum(['EXACT', 'PHRASE', 'BROAD']),
  negative: z.literal(true)
})
const PositiveCriterionSchema = z.object({
  text: z.string(),
  matchType: z.enum(['EXACT', 'PHRASE', 'BROAD']),
  negative: z.literal(false),
  status: z.enum(['ENABLED', 'PAUSED'])
})
const BudgetStateSchema = z.object({
  resourceName: z.string(),
  name: z.string(),
  amountMicros: z.union([z.string(), z.number()]).transform(String),
  deliveryMethod: z.string(),
  explicitlyShared: z.boolean()
})
const CampaignStateSchema = z.object({
  resourceName: z.string(),
  name: z.string(),
  status: z.string(),
  advertisingChannelType: z.string(),
  campaignBudget: z.string(),
  manualCpc: z.record(z.string(), z.unknown()),
  networkSettings: z.object({
    targetGoogleSearch: z.boolean(),
    targetSearchNetwork: z.boolean(),
    targetPartnerSearchNetwork: z.boolean(),
    targetContentNetwork: z.boolean()
  }),
  containsEuPoliticalAdvertising: z.string(),
  startDateTime: z.string().optional(),
  endDateTime: z.string().optional()
})
const AdGroupStateSchema = z.object({
  resourceName: z.string(),
  name: z.string(),
  campaign: z.string(),
  type: z.string(),
  status: z.string(),
  cpcBidMicros: z.union([z.string(), z.number()]).transform(String).optional()
})
const AdGroupAdStateSchema = z.object({
  resourceName: z.string(),
  adGroup: z.string(),
  status: z.string(),
  ad: z.object({
    finalUrls: z.array(z.string()),
    responsiveSearchAd: z.object({
      headlines: z.array(z.object({ text: z.string() })),
      descriptions: z.array(z.object({ text: z.string() })),
      path1: z.string().optional(),
      path2: z.string().optional()
    })
  })
})
const AdScheduleStateSchema = z.object({
  dayOfWeek: z.enum([
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'
  ]),
  startHour: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().int().min(0).max(23)),
  startMinute: z.enum(['ZERO', 'FIFTEEN', 'THIRTY', 'FORTY_FIVE']),
  endHour: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().int().min(0).max(24)),
  endMinute: z.enum(['ZERO', 'FIFTEEN', 'THIRTY', 'FORTY_FIVE'])
})

type NormalizedAdSchedule = {
  dayOfWeek: z.infer<typeof AdScheduleStateSchema>['dayOfWeek']
  startHour: number
  startMinute: 0 | 15 | 30 | 45
  endHour: number
  endMinute: 0 | 15 | 30 | 45
}

const AD_SCHEDULE_DAY_ORDER: Record<NormalizedAdSchedule['dayOfWeek'], number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6
}
const AD_SCHEDULE_MINUTES = {
  ZERO: 0,
  FIFTEEN: 15,
  THIRTY: 30,
  FORTY_FIVE: 45
} as const
const DeviceCriterionStateSchema = z.object({
  resourceName: z.string(),
  bidModifier: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().finite()),
  device: z.object({
    type: z.enum(['MOBILE', 'DESKTOP', 'TABLET', 'CONNECTED_TV', 'OTHER'])
  })
})
const AgeRangeTypeSchema = z.enum([
  'AGE_RANGE_18_24', 'AGE_RANGE_25_34', 'AGE_RANGE_35_44', 'AGE_RANGE_45_54',
  'AGE_RANGE_55_64', 'AGE_RANGE_65_UP', 'AGE_RANGE_UNDETERMINED'
])
const GenderTypeSchema = z.enum(['FEMALE', 'MALE', 'UNDETERMINED'])
const ContentLabelTypeSchema = z.enum([
  'BELOW_THE_FOLD', 'BRAND_SUITABILITY_CONTENT_FOR_FAMILIES', 'BRAND_SUITABILITY_GAMES_FIGHTING',
  'BRAND_SUITABILITY_GAMES_MATURE', 'BRAND_SUITABILITY_HEALTH_SENSITIVE',
  'BRAND_SUITABILITY_HEALTH_SOURCE_UNDETERMINED', 'LIVE_STREAMING_VIDEO', 'PARKED_DOMAIN',
  'PROFANITY', 'SEXUALLY_SUGGESTIVE', 'SOCIAL_ISSUES', 'TRAGEDY', 'VIDEO', 'VIDEO_NOT_YET_RATED',
  'VIDEO_RATING_DV_G', 'VIDEO_RATING_DV_MA', 'VIDEO_RATING_DV_PG', 'VIDEO_RATING_DV_T'
])
const ConversionActionStateSchema = z.object({
  resourceName: z.string(),
  name: z.string().trim().min(1).max(255),
  status: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  type: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  category: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  origin: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  primaryForGoal: z.boolean(),
  includeInConversionsMetric: z.boolean(),
  countingType: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
  clickThroughLookbackWindowDays: z.union([z.string(), z.number()]).transform(String).optional(),
  viewThroughLookbackWindowDays: z.union([z.string(), z.number()]).transform(String).optional()
})
const ConversionGoalCategorySchema = z.enum([
  'ADD_TO_CART', 'BEGIN_CHECKOUT', 'BOOK_APPOINTMENT', 'CONTACT', 'CONVERTED_LEAD', 'DEFAULT',
  'DOWNLOAD', 'ENGAGEMENT', 'GET_DIRECTIONS', 'IMPORTED_LEAD', 'OUTBOUND_CLICK', 'PAGE_VIEW',
  'PHONE_CALL_LEAD', 'PURCHASE', 'QUALIFIED_LEAD', 'REQUEST_QUOTE', 'SIGNUP', 'STORE_SALE',
  'STORE_VISIT', 'SUBMIT_LEAD_FORM', 'SUBSCRIBE_PAID', 'YOUTUBE_FOLLOW_ON_VIEWS'
])
const ConversionGoalOriginSchema = z.enum([
  'APP', 'CALL_FROM_ADS', 'GOOGLE_HOSTED', 'LOCAL_SERVICES_ADS', 'STORE', 'WEBSITE', 'YOUTUBE_HOSTED'
])

function normalizeAdSchedule(value: z.infer<typeof AdScheduleStateSchema>): NormalizedAdSchedule {
  return {
    dayOfWeek: value.dayOfWeek,
    startHour: value.startHour,
    startMinute: AD_SCHEDULE_MINUTES[value.startMinute],
    endHour: value.endHour,
    endMinute: AD_SCHEDULE_MINUTES[value.endMinute]
  }
}

function adScheduleKey(schedule: NormalizedAdSchedule): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${schedule.dayOfWeek}:${pad(schedule.startHour)}:${pad(schedule.startMinute)}-${pad(schedule.endHour)}:${pad(schedule.endMinute)}`
}

const STATUS_READS = {
  pause_campaign: { from: 'campaign', select: 'campaign.resource_name, campaign.status', key: 'campaign' },
  archive_campaign: { from: 'campaign', select: 'campaign.resource_name, campaign.status', key: 'campaign' },
  enable_campaign: { from: 'campaign', select: 'campaign.resource_name, campaign.status', key: 'campaign' },
  set_campaign_status: { from: 'campaign', select: 'campaign.resource_name, campaign.status', key: 'campaign' },
  pause_ad_group: { from: 'ad_group', select: 'ad_group.resource_name, ad_group.status', key: 'adGroup' },
  archive_ad_group: { from: 'ad_group', select: 'ad_group.resource_name, ad_group.status', key: 'adGroup' },
  enable_ad_group: { from: 'ad_group', select: 'ad_group.resource_name, ad_group.status', key: 'adGroup' },
  set_ad_group_status: { from: 'ad_group', select: 'ad_group.resource_name, ad_group.status', key: 'adGroup' },
  pause_ad: { from: 'ad_group_ad', select: 'ad_group_ad.resource_name, ad_group_ad.status', key: 'adGroupAd' },
  archive_ad: { from: 'ad_group_ad', select: 'ad_group_ad.resource_name, ad_group_ad.status', key: 'adGroupAd' },
  enable_ad: { from: 'ad_group_ad', select: 'ad_group_ad.resource_name, ad_group_ad.status', key: 'adGroupAd' },
  update_ad_status: { from: 'ad_group_ad', select: 'ad_group_ad.resource_name, ad_group_ad.status', key: 'adGroupAd' },
  pause_keyword: { from: 'keyword_view', select: 'ad_group_criterion.resource_name, ad_group_criterion.status', key: 'adGroupCriterion' },
  enable_keyword: { from: 'keyword_view', select: 'ad_group_criterion.resource_name, ad_group_criterion.status', key: 'adGroupCriterion' },
  set_keyword_status: { from: 'keyword_view', select: 'ad_group_criterion.resource_name, ad_group_criterion.status', key: 'adGroupCriterion' }
} as const

type StatusReadOperation = keyof typeof STATUS_READS

function isStatusReadOperation(value: string): value is StatusReadOperation {
  return Object.hasOwn(STATUS_READS, value)
}

function resourceIds(resourceName: string): number[] {
  const leaf = resourceName.slice(resourceName.lastIndexOf('/') + 1)
  const parts = leaf.split('~')
  if (parts.length > 2 || parts.some(part => !/^\d+$/.test(part))) {
    throw new Error('Invalid Google Ads resource name')
  }
  return parts.map(Number)
}

function escapeGaqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')
}

function assertCustomerResourceName(
  resourceName: string,
  customerId: string,
  segment: string,
  composite = false
): void {
  const leaf = composite ? '\\d+~\\d+' : '\\d+'
  const pattern = new RegExp(`^customers/${customerId}/${segment}/${leaf}$`)
  if (!pattern.test(resourceName)) {
    throw new Error('Google Ads returned a resource outside the selected customer')
  }
}

async function assertBudgetNameAvailable(
  customerId: string,
  name: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{ exists: false }> {
  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT campaign_budget.resource_name
FROM campaign_budget
WHERE campaign_budget.name = '${escapeGaqlString(name)}'`
  })
  if (result.rows.length > 0 || result.more > 0) {
    throw new Error(`A Google Ads campaign budget named "${name}" already exists`)
  }
  return { exists: false }
}

async function loadBudgetByResourceName(
  customerId: string,
  resourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<z.infer<typeof BudgetStateSchema>> {
  assertCustomerResourceName(resourceName, customerId, 'campaignBudgets')
  const [id] = resourceIds(resourceName)
  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT campaign_budget.resource_name,
  campaign_budget.name,
  campaign_budget.amount_micros,
  campaign_budget.delivery_method,
  campaign_budget.explicitly_shared
FROM campaign_budget
WHERE campaign_budget.id = ${id}`
  })
  const first = result.rows[0]
  const budget = first && typeof first === 'object'
    ? (first as Record<string, unknown>).campaignBudget
    : undefined
  if (!budget) throw new Error('Google Ads campaign budget was not found after mutation')
  return BudgetStateSchema.parse(budget)
}

async function loadCreateCampaignCurrentState(
  customerId: string,
  name: string,
  budgetResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{ exists: false, campaignBudgetResourceName: string }> {
  assertCustomerResourceName(budgetResourceName, customerId, 'campaignBudgets')
  const duplicate = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT campaign.resource_name
FROM campaign
WHERE campaign.name = '${escapeGaqlString(name)}'`
  })
  if (duplicate.rows.length > 0 || duplicate.more > 0) {
    throw new Error(`A Google Ads campaign named "${name}" already exists`)
  }

  const [budgetId] = resourceIds(budgetResourceName)
  const budget = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT campaign_budget.resource_name
FROM campaign_budget
WHERE campaign_budget.id = ${budgetId}`
  })
  const first = budget.rows[0]
  const resource = first && typeof first === 'object'
    ? (first as Record<string, unknown>).campaignBudget
    : undefined
  const parsed = z.object({ resourceName: z.string() }).safeParse(resource)
  if (!parsed.success || parsed.data.resourceName !== budgetResourceName) {
    throw new Error('The referenced campaign budget was not found')
  }
  return { exists: false, campaignBudgetResourceName: budgetResourceName }
}

async function loadCampaignByResourceName(
  customerId: string,
  resourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<z.infer<typeof CampaignStateSchema>> {
  assertCustomerResourceName(resourceName, customerId, 'campaigns')
  const [id] = resourceIds(resourceName)
  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT campaign.resource_name,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.campaign_budget,
  campaign.manual_cpc,
  campaign.network_settings.target_google_search,
  campaign.network_settings.target_search_network,
  campaign.network_settings.target_partner_search_network,
  campaign.network_settings.target_content_network,
  campaign.contains_eu_political_advertising,
  campaign.start_date_time,
  campaign.end_date_time
FROM campaign
WHERE campaign.id = ${id}`
  })
  const first = result.rows[0]
  const campaign = first && typeof first === 'object'
    ? (first as Record<string, unknown>).campaign
    : undefined
  if (!campaign) throw new Error('Google Ads campaign was not found after mutation')
  return CampaignStateSchema.parse(campaign)
}

async function loadCreateAdGroupCurrentState(
  customerId: string,
  name: string,
  campaignResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{ exists: false, campaignResourceName: string }> {
  assertCustomerResourceName(campaignResourceName, customerId, 'campaigns')
  const [campaignId] = resourceIds(campaignResourceName)
  const duplicate = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT ad_group.resource_name
FROM ad_group
WHERE ad_group.name = '${escapeGaqlString(name)}'
  AND campaign.id = ${campaignId}`
  })
  if (duplicate.rows.length > 0 || duplicate.more > 0) {
    throw new Error(`A Google Ads ad group named "${name}" already exists in this campaign`)
  }

  const parent = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT campaign.resource_name
FROM campaign
WHERE campaign.id = ${campaignId}`
  })
  const first = parent.rows[0]
  const campaign = first && typeof first === 'object'
    ? (first as Record<string, unknown>).campaign
    : undefined
  const parsed = z.object({ resourceName: z.string() }).safeParse(campaign)
  if (!parsed.success || parsed.data.resourceName !== campaignResourceName) {
    throw new Error('The referenced campaign was not found')
  }
  return { exists: false, campaignResourceName }
}

async function loadAdGroupByResourceName(
  customerId: string,
  resourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<z.infer<typeof AdGroupStateSchema>> {
  assertCustomerResourceName(resourceName, customerId, 'adGroups')
  const [id] = resourceIds(resourceName)
  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT ad_group.resource_name,
  ad_group.name,
  ad_group.campaign,
  ad_group.type,
  ad_group.status,
  ad_group.cpc_bid_micros
FROM ad_group
WHERE ad_group.id = ${id}`
  })
  const first = result.rows[0]
  const adGroup = first && typeof first === 'object'
    ? (first as Record<string, unknown>).adGroup
    : undefined
  if (!adGroup) throw new Error('Google Ads ad group was not found after mutation')
  return AdGroupStateSchema.parse(adGroup)
}

async function loadCreateAdCurrentState(
  customerId: string,
  adGroupResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{ adGroupResourceName: string }> {
  assertCustomerResourceName(adGroupResourceName, customerId, 'adGroups')
  const [adGroupId] = resourceIds(adGroupResourceName)
  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT ad_group.resource_name
FROM ad_group
WHERE ad_group.id = ${adGroupId}`
  })
  const first = result.rows[0]
  const adGroup = first && typeof first === 'object'
    ? (first as Record<string, unknown>).adGroup
    : undefined
  const parsed = z.object({ resourceName: z.string() }).safeParse(adGroup)
  if (!parsed.success || parsed.data.resourceName !== adGroupResourceName) {
    throw new Error('The referenced ad group was not found')
  }
  return { adGroupResourceName }
}

async function loadAdGroupAdByResourceName(
  customerId: string,
  resourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<z.infer<typeof AdGroupAdStateSchema>> {
  assertCustomerResourceName(resourceName, customerId, 'adGroupAds', true)
  const [adGroupId, adId] = resourceIds(resourceName)
  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT ad_group_ad.resource_name,
  ad_group_ad.ad_group,
  ad_group_ad.status,
  ad_group_ad.ad.final_urls,
  ad_group_ad.ad.responsive_search_ad.headlines,
  ad_group_ad.ad.responsive_search_ad.descriptions,
  ad_group_ad.ad.responsive_search_ad.path1,
  ad_group_ad.ad.responsive_search_ad.path2
FROM ad_group_ad
WHERE ad_group.id = ${adGroupId}
  AND ad_group_ad.ad.id = ${adId}`
  })
  const first = result.rows[0]
  const adGroupAd = first && typeof first === 'object'
    ? (first as Record<string, unknown>).adGroupAd
    : undefined
  if (!adGroupAd) throw new Error('Google Ads responsive search ad was not found after mutation')
  return AdGroupAdStateSchema.parse(adGroupAd)
}

function mutationResourceName(
  mutation: GoogleAdsMutateResult,
  service: string
): string {
  const first = mutation.results[0]
  if (!first || typeof first !== 'object') {
    throw new Error('Google Ads mutation did not return a created resource')
  }
  const record = first as Record<string, unknown>
  if (typeof record.resourceName === 'string') return record.resourceName
  const singular = {
    campaignBudgets: 'campaignBudget',
    campaigns: 'campaign',
    adGroups: 'adGroup',
    adGroupAds: 'adGroupAd',
    conversionActions: 'conversionAction'
  }[service] ?? ''
  const nested = singular ? record[singular] : undefined
  if (nested && typeof nested === 'object'
    && typeof (nested as Record<string, unknown>).resourceName === 'string') {
    return (nested as Record<string, unknown>).resourceName as string
  }
  throw new Error('Google Ads mutation did not return a created resource name')
}

function statusWhere(from: string, ids: number[]): string {
  if (from === 'campaign') return `campaign.id = ${ids[0]}`
  if (from === 'ad_group') return `ad_group.id = ${ids[0]}`
  if (from === 'ad_group_ad') return `ad_group.id = ${ids[0]} AND ad_group_ad.ad.id = ${ids[1]}`
  return `ad_group.id = ${ids[0]} AND ad_group_criterion.criterion_id = ${ids[1]}`
}

async function loadStatus(
  context: Omit<BuildGoogleAdsActionContext, 'currentState'>,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<Record<string, unknown>> {
  if (!isStatusReadOperation(context.input.operation)) throw new Error('Unsupported Search status operation')
  const config = STATUS_READS[context.input.operation]
  const args = StatusArgumentsSchema.parse(parseSearchGoogleAdsArguments(
    context.input.operation,
    context.input.arguments
  ))
  const result = await dependencies.query({
    customerId: context.customerId,
    auth,
    maxRows: 1,
    query: `SELECT ${config.select} FROM ${config.from} WHERE ${statusWhere(config.from, resourceIds(args.resourceName))}`
  })
  const first = result.rows[0]
  if (!first || typeof first !== 'object' || !(config.key in first)) {
    throw new Error('Google Ads status resource was not found')
  }
  const resource = (first as Record<string, unknown>)[config.key]
  const parsed = z.object({
    resourceName: z.string(),
    status: z.string()
  }).parse(resource)
  return parsed
}

function normalizedCriteria(rows: unknown[], rowKey: 'campaignCriterion' | 'adGroupCriterion') {
  const criteria: Array<z.infer<typeof CriterionSchema>> = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const criterion = (row as Record<string, unknown>)[rowKey]
    const parsed = z.object({
      negative: z.literal(true),
      keyword: z.object({
        text: z.string(),
        matchType: z.enum(['EXACT', 'PHRASE', 'BROAD'])
      })
    }).safeParse(criterion)
    if (parsed.success) {
      criteria.push({ ...parsed.data.keyword, negative: true })
    }
  }
  return criteria.sort((left, right) => {
    const leftKey = `${left.matchType}:${left.text.toLocaleLowerCase('en-AU')}`
    const rightKey = `${right.matchType}:${right.text.toLocaleLowerCase('en-AU')}`
    return leftKey.localeCompare(rightKey)
  })
}

async function loadNegativeKeywords(
  context: Omit<BuildGoogleAdsActionContext, 'currentState'>,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{ criteria: Array<z.infer<typeof CriterionSchema>> }> {
  const args = NegativeArgumentsSchema.parse(parseSearchGoogleAdsArguments(
    context.input.operation,
    context.input.arguments
  ))
  const campaign = args.scope === 'campaign'
  const prefix = campaign ? 'campaign_criterion' : 'ad_group_criterion'
  const parent = campaign ? 'campaign' : 'ad_group'
  const result = await dependencies.query({
    customerId: context.customerId,
    auth,
    maxRows: 10_000,
    query: `SELECT ${prefix}.negative, ${prefix}.keyword.text, ${prefix}.keyword.match_type
FROM ${prefix}
WHERE ${prefix}.${parent} = '${args.parentResourceName}'
  AND ${prefix}.type = 'KEYWORD'
  AND ${prefix}.negative = TRUE`
  })
  if (result.more > 0) throw new Error('Google Ads negative keyword state exceeds the safe read limit')
  return {
    criteria: normalizedCriteria(
      result.rows,
      campaign ? 'campaignCriterion' : 'adGroupCriterion'
    )
  }
}

function normalizedPositiveCriteria(rows: unknown[]) {
  const criteria: Array<z.infer<typeof PositiveCriterionSchema>> = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const criterion = (row as Record<string, unknown>).adGroupCriterion
    const parsed = z.object({
      negative: z.literal(false),
      status: z.enum(['ENABLED', 'PAUSED']),
      keyword: z.object({
        text: z.string(),
        matchType: z.enum(['EXACT', 'PHRASE', 'BROAD'])
      })
    }).safeParse(criterion)
    if (parsed.success) {
      const normalized = PositiveCriterionSchema.parse({
        ...parsed.data.keyword,
        negative: false,
        status: parsed.data.status
      })
      criteria.push(normalized)
    }
  }
  return criteria.sort((left, right) => {
    const leftKey = `${left.matchType}:${left.text.toLocaleLowerCase('en-AU')}`
    const rightKey = `${right.matchType}:${right.text.toLocaleLowerCase('en-AU')}`
    return leftKey.localeCompare(rightKey)
  })
}

async function loadPositiveKeywords(
  customerId: string,
  adGroupResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{
  adGroupResourceName: string
  criteria: Array<z.infer<typeof PositiveCriterionSchema>>
}> {
  await loadCreateAdCurrentState(customerId, adGroupResourceName, auth, dependencies)
  const [adGroupId] = resourceIds(adGroupResourceName)
  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 10_000,
    query: `SELECT ad_group_criterion.status,
  ad_group_criterion.negative,
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type
FROM ad_group_criterion
WHERE ad_group.id = ${adGroupId}
  AND ad_group_criterion.type = 'KEYWORD'
  AND ad_group_criterion.negative = FALSE
  AND ad_group_criterion.status != 'REMOVED'`
  })
  if (result.more > 0) throw new Error('Google Ads positive keyword state exceeds the safe read limit')
  return {
    adGroupResourceName,
    criteria: normalizedPositiveCriteria(result.rows)
  }
}

async function loadCampaignLocations(
  customerId: string,
  campaignResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{
  campaignResourceName: string
  locationIds: string[]
  criteria: Record<string, string>
}> {
  assertCustomerResourceName(campaignResourceName, customerId, 'campaigns')
  const [campaignId] = resourceIds(campaignResourceName)
  const parent = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT campaign.resource_name
FROM campaign
WHERE campaign.id = ${campaignId}`
  })
  const parentRow = parent.rows[0]
  const campaign = parentRow && typeof parentRow === 'object'
    ? (parentRow as Record<string, unknown>).campaign
    : undefined
  const parsedCampaign = z.object({ resourceName: z.string() }).safeParse(campaign)
  if (!parsedCampaign.success || parsedCampaign.data.resourceName !== campaignResourceName) {
    throw new Error('The referenced campaign was not found')
  }

  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 10_000,
    query: `SELECT campaign_criterion.resource_name,
  campaign_criterion.negative,
  campaign_criterion.location.geo_target_constant
FROM campaign_criterion
WHERE campaign.id = ${campaignId}
  AND campaign_criterion.type = 'LOCATION'
  AND campaign_criterion.negative = FALSE`
  })
  if (result.more > 0) throw new Error('Google Ads campaign location state exceeds the safe read limit')

  const criteria: Record<string, string> = {}
  for (const row of result.rows) {
    if (!row || typeof row !== 'object') continue
    const parsed = z.object({
      resourceName: z.string(),
      negative: z.literal(false),
      location: z.object({
        geoTargetConstant: z.string().regex(/^geoTargetConstants\/\d{1,20}$/)
      })
    }).safeParse((row as Record<string, unknown>).campaignCriterion)
    if (!parsed.success) throw new Error('Google Ads returned invalid campaign location state')
    assertCustomerResourceName(parsed.data.resourceName, customerId, 'campaignCriteria', true)
    const [criterionCampaignId] = resourceIds(parsed.data.resourceName)
    if (criterionCampaignId !== campaignId) {
      throw new Error('Google Ads returned a location outside the selected campaign')
    }
    const id = parsed.data.location.geoTargetConstant.slice('geoTargetConstants/'.length)
    criteria[id] = parsed.data.resourceName
  }
  const locationIds = Object.keys(criteria)
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
  return { campaignResourceName, locationIds, criteria }
}

async function loadCampaignLocationMatchMode(
  customerId: string,
  campaignResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{
  campaignResourceName: string
  positiveGeoTargetType: 'PRESENCE' | 'PRESENCE_OR_INTEREST'
}> {
  assertCustomerResourceName(campaignResourceName, customerId, 'campaigns')
  const [campaignId] = resourceIds(campaignResourceName)
  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT campaign.resource_name,
  campaign.geo_target_type_setting.positive_geo_target_type
FROM campaign
WHERE campaign.id = ${campaignId}`
  })
  const first = result.rows[0]
  const campaign = first && typeof first === 'object'
    ? (first as Record<string, unknown>).campaign
    : undefined
  const parsed = z.object({
    resourceName: z.literal(campaignResourceName),
    geoTargetTypeSetting: z.object({
      positiveGeoTargetType: z.enum(['PRESENCE', 'PRESENCE_OR_INTEREST'])
    })
  }).safeParse(campaign)
  if (!parsed.success) throw new Error('Google Ads campaign location match mode was not found')
  return {
    campaignResourceName,
    positiveGeoTargetType: parsed.data.geoTargetTypeSetting.positiveGeoTargetType
  }
}

async function loadCampaignLanguages(
  customerId: string,
  campaignResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{
  campaignResourceName: string
  languageIds: string[]
  criteria: Record<string, string>
}> {
  assertCustomerResourceName(campaignResourceName, customerId, 'campaigns')
  const [campaignId] = resourceIds(campaignResourceName)
  const parent = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT campaign.resource_name
FROM campaign
WHERE campaign.id = ${campaignId}`
  })
  const parentRow = parent.rows[0]
  const campaign = parentRow && typeof parentRow === 'object'
    ? (parentRow as Record<string, unknown>).campaign
    : undefined
  const parsedCampaign = z.object({ resourceName: z.literal(campaignResourceName) }).safeParse(campaign)
  if (!parsedCampaign.success) throw new Error('The referenced campaign was not found')

  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 10_000,
    query: `SELECT campaign_criterion.resource_name,
  campaign_criterion.negative,
  campaign_criterion.language.language_constant
FROM campaign_criterion
WHERE campaign.id = ${campaignId}
  AND campaign_criterion.type = 'LANGUAGE'
  AND campaign_criterion.negative = FALSE`
  })
  if (result.more > 0) throw new Error('Google Ads campaign language state exceeds the safe read limit')

  const criteria: Record<string, string> = {}
  for (const row of result.rows) {
    if (!row || typeof row !== 'object') continue
    const parsed = z.object({
      resourceName: z.string(),
      negative: z.literal(false),
      language: z.object({
        languageConstant: z.string().regex(/^languageConstants\/\d{1,20}$/)
      })
    }).safeParse((row as Record<string, unknown>).campaignCriterion)
    if (!parsed.success) throw new Error('Google Ads returned invalid campaign language state')
    assertCustomerResourceName(parsed.data.resourceName, customerId, 'campaignCriteria', true)
    const [criterionCampaignId] = resourceIds(parsed.data.resourceName)
    if (criterionCampaignId !== campaignId) {
      throw new Error('Google Ads returned a language outside the selected campaign')
    }
    const id = parsed.data.language.languageConstant.slice('languageConstants/'.length)
    criteria[id] = parsed.data.resourceName
  }
  const languageIds = Object.keys(criteria)
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
  return { campaignResourceName, languageIds, criteria }
}

async function loadCampaignAdSchedules(
  customerId: string,
  campaignResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{
  campaignResourceName: string
  schedules: NormalizedAdSchedule[]
  criteria: Record<string, string>
}> {
  assertCustomerResourceName(campaignResourceName, customerId, 'campaigns')
  const [campaignId] = resourceIds(campaignResourceName)
  const parent = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT campaign.resource_name
FROM campaign
WHERE campaign.id = ${campaignId}`
  })
  const parentRow = parent.rows[0]
  const campaign = parentRow && typeof parentRow === 'object'
    ? (parentRow as Record<string, unknown>).campaign
    : undefined
  const parsedCampaign = z.object({ resourceName: z.literal(campaignResourceName) }).safeParse(campaign)
  if (!parsedCampaign.success) throw new Error('The referenced campaign was not found')

  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 10_000,
    query: `SELECT campaign_criterion.resource_name,
  campaign_criterion.negative,
  campaign_criterion.ad_schedule.day_of_week,
  campaign_criterion.ad_schedule.start_hour,
  campaign_criterion.ad_schedule.start_minute,
  campaign_criterion.ad_schedule.end_hour,
  campaign_criterion.ad_schedule.end_minute
FROM campaign_criterion
WHERE campaign.id = ${campaignId}
  AND campaign_criterion.type = 'AD_SCHEDULE'
  AND campaign_criterion.negative = FALSE`
  })
  if (result.more > 0) throw new Error('Google Ads campaign ad schedule state exceeds the safe read limit')

  const criteria: Record<string, string> = {}
  const schedules: NormalizedAdSchedule[] = []
  for (const row of result.rows) {
    if (!row || typeof row !== 'object') continue
    const parsed = z.object({
      resourceName: z.string(),
      negative: z.literal(false),
      adSchedule: AdScheduleStateSchema
    }).safeParse((row as Record<string, unknown>).campaignCriterion)
    if (!parsed.success) throw new Error('Google Ads returned invalid campaign ad schedule state')
    assertCustomerResourceName(parsed.data.resourceName, customerId, 'campaignCriteria', true)
    const [criterionCampaignId] = resourceIds(parsed.data.resourceName)
    if (criterionCampaignId !== campaignId) {
      throw new Error('Google Ads returned an ad schedule outside the selected campaign')
    }
    const schedule = normalizeAdSchedule(parsed.data.adSchedule)
    schedules.push(schedule)
    criteria[adScheduleKey(schedule)] = parsed.data.resourceName
  }
  schedules.sort((left, right) => (
    AD_SCHEDULE_DAY_ORDER[left.dayOfWeek] - AD_SCHEDULE_DAY_ORDER[right.dayOfWeek]
    || left.startHour - right.startHour
    || left.startMinute - right.startMinute
    || left.endHour - right.endHour
    || left.endMinute - right.endMinute
  ))
  return { campaignResourceName, schedules, criteria }
}

async function loadCampaignDevices(
  customerId: string,
  campaignResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{
  campaignResourceName: string
  devices: Array<{
    resourceName: string
    type: 'MOBILE' | 'DESKTOP' | 'TABLET' | 'CONNECTED_TV' | 'OTHER'
    bidModifier: number
  }>
}> {
  assertCustomerResourceName(campaignResourceName, customerId, 'campaigns')
  const [campaignId] = resourceIds(campaignResourceName)
  const parent = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT campaign.resource_name
FROM campaign
WHERE campaign.id = ${campaignId}`
  })
  const parentRow = parent.rows[0]
  const campaign = parentRow && typeof parentRow === 'object'
    ? (parentRow as Record<string, unknown>).campaign
    : undefined
  const parsedCampaign = z.object({ resourceName: z.literal(campaignResourceName) }).safeParse(campaign)
  if (!parsedCampaign.success) throw new Error('The referenced campaign was not found')

  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 100,
    query: `SELECT campaign_criterion.resource_name,
  campaign_criterion.bid_modifier,
  campaign_criterion.device.type
FROM campaign_criterion
WHERE campaign.id = ${campaignId}
  AND campaign_criterion.type = 'DEVICE'`
  })
  if (result.more > 0) throw new Error('Google Ads campaign device state exceeds the safe read limit')

  const devices: Array<{
    resourceName: string
    type: 'MOBILE' | 'DESKTOP' | 'TABLET' | 'CONNECTED_TV' | 'OTHER'
    bidModifier: number
  }> = []
  const seen = new Set<string>()
  for (const row of result.rows) {
    if (!row || typeof row !== 'object') continue
    const parsed = DeviceCriterionStateSchema.safeParse((row as Record<string, unknown>).campaignCriterion)
    if (!parsed.success) throw new Error('Google Ads returned invalid campaign device state')
    assertCustomerResourceName(parsed.data.resourceName, customerId, 'campaignCriteria', true)
    const [criterionCampaignId] = resourceIds(parsed.data.resourceName)
    if (criterionCampaignId !== campaignId) {
      throw new Error('Google Ads returned a device criterion outside the selected campaign')
    }
    if (seen.has(parsed.data.device.type)) throw new Error('Google Ads returned duplicate campaign device criteria')
    seen.add(parsed.data.device.type)
    devices.push({
      resourceName: parsed.data.resourceName,
      type: parsed.data.device.type,
      bidModifier: parsed.data.bidModifier
    })
  }
  devices.sort((left, right) => left.type.localeCompare(right.type))
  return { campaignResourceName, devices }
}

async function loadAdGroupDemographics(
  customerId: string,
  adGroupResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{ adGroupResourceName: string, criteria: Array<Record<string, unknown>> }> {
  assertCustomerResourceName(adGroupResourceName, customerId, 'adGroups')
  const [adGroupId] = resourceIds(adGroupResourceName)
  const parent = await dependencies.query({
    customerId, auth, maxRows: 1,
    query: `SELECT ad_group.resource_name FROM ad_group WHERE ad_group.id = ${adGroupId}`
  })
  const adGroup = parent.rows[0] && typeof parent.rows[0] === 'object'
    ? (parent.rows[0] as Record<string, unknown>).adGroup
    : undefined
  if (!z.object({ resourceName: z.literal(adGroupResourceName) }).safeParse(adGroup).success) {
    throw new Error('The referenced ad group was not found')
  }
  const result = await dependencies.query({
    customerId, auth, maxRows: 100,
    query: `SELECT ad_group_criterion.resource_name,
  ad_group_criterion.ad_group,
  ad_group_criterion.negative,
  ad_group_criterion.age_range.type,
  ad_group_criterion.gender.type
FROM ad_group_criterion
WHERE ad_group.id = ${adGroupId}
  AND ad_group_criterion.type IN ('AGE_RANGE', 'GENDER')`
  })
  if (result.more > 0) throw new Error('Google Ads demographic state exceeds the safe read limit')
  const criteria = result.rows.map((row) => {
    const criterion = row && typeof row === 'object'
      ? (row as Record<string, unknown>).adGroupCriterion
      : undefined
    const base = z.object({
      resourceName: z.string(),
      adGroup: z.literal(adGroupResourceName),
      negative: z.boolean(),
      ageRange: z.object({ type: AgeRangeTypeSchema }).optional(),
      gender: z.object({ type: GenderTypeSchema }).optional()
    }).parse(criterion)
    assertCustomerResourceName(base.resourceName, customerId, 'adGroupCriteria', true)
    const [criterionAdGroupId] = resourceIds(base.resourceName)
    if (criterionAdGroupId !== adGroupId || Boolean(base.ageRange) === Boolean(base.gender)) {
      throw new Error('Google Ads returned invalid demographic criteria for the selected ad group')
    }
    return base.ageRange
      ? { resourceName: base.resourceName, dimension: 'AGE_RANGE', type: base.ageRange.type, excluded: base.negative }
      : { resourceName: base.resourceName, dimension: 'GENDER', type: base.gender!.type, excluded: base.negative }
  }).sort((left, right) => `${left.dimension}:${left.type}`.localeCompare(`${right.dimension}:${right.type}`))
  return { adGroupResourceName, criteria }
}

async function loadPlacementExclusions(
  customerId: string,
  scope: 'campaign' | 'ad_group',
  parentResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{ scope: 'campaign' | 'ad_group', parentResourceName: string, placements: Array<Record<string, unknown>> }> {
  const parentSegment = scope === 'campaign' ? 'campaigns' : 'adGroups'
  const criterionSegment = scope === 'campaign' ? 'campaignCriteria' : 'adGroupCriteria'
  const resource = scope === 'campaign' ? 'campaign' : 'ad_group'
  const responseKey = scope === 'campaign' ? 'campaignCriterion' : 'adGroupCriterion'
  const parentKey = scope === 'campaign' ? 'campaign' : 'adGroup'
  assertCustomerResourceName(parentResourceName, customerId, parentSegment)
  const [parentId] = resourceIds(parentResourceName)
  const parent = await dependencies.query({
    customerId, auth, maxRows: 1,
    query: `SELECT ${resource}.resource_name FROM ${resource} WHERE ${resource}.id = ${parentId}`
  })
  const parentValue = parent.rows[0] && typeof parent.rows[0] === 'object'
    ? (parent.rows[0] as Record<string, unknown>)[scope === 'campaign' ? 'campaign' : 'adGroup']
    : undefined
  if (!z.object({ resourceName: z.literal(parentResourceName) }).safeParse(parentValue).success) {
    throw new Error(`The referenced ${scope === 'campaign' ? 'campaign' : 'ad group'} was not found`)
  }
  const prefix = scope === 'campaign' ? 'campaign_criterion' : 'ad_group_criterion'
  const result = await dependencies.query({
    customerId, auth, maxRows: 1_000,
    query: `SELECT ${prefix}.resource_name,
  ${prefix}.${resource},
  ${prefix}.negative,
  ${prefix}.placement.url
FROM ${prefix}
WHERE ${resource}.id = ${parentId}
  AND ${prefix}.type = 'PLACEMENT'
  AND ${prefix}.negative = TRUE`
  })
  if (result.more > 0) throw new Error('Google Ads placement state exceeds the safe read limit')
  const placements = result.rows.map((row) => {
    const raw = row && typeof row === 'object' ? (row as Record<string, unknown>)[responseKey] : undefined
    const parentValue = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[parentKey] : undefined
    const parsed = z.object({
      resourceName: z.string(),
      negative: z.literal(true),
      placement: z.object({ url: z.string().trim().min(1).max(250) })
    }).parse(raw)
    if (parentValue !== parentResourceName) throw new Error('Google Ads returned a placement outside the selected parent')
    assertCustomerResourceName(parsed.resourceName, customerId, criterionSegment, true)
    const [criterionParentId] = resourceIds(parsed.resourceName)
    if (criterionParentId !== parentId) throw new Error('Google Ads returned a placement outside the selected parent')
    return { resourceName: parsed.resourceName, url: parsed.placement.url }
  }).sort((left, right) => left.url.localeCompare(right.url))
  return { scope, parentResourceName, placements }
}

async function loadCampaignContentExclusions(
  customerId: string,
  campaignResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{ campaignResourceName: string, labels: Array<Record<string, unknown>> }> {
  assertCustomerResourceName(campaignResourceName, customerId, 'campaigns')
  const [campaignId] = resourceIds(campaignResourceName)
  const parent = await dependencies.query({
    customerId, auth, maxRows: 1,
    query: `SELECT campaign.resource_name FROM campaign WHERE campaign.id = ${campaignId}`
  })
  const campaign = parent.rows[0] && typeof parent.rows[0] === 'object'
    ? (parent.rows[0] as Record<string, unknown>).campaign
    : undefined
  if (!z.object({ resourceName: z.literal(campaignResourceName) }).safeParse(campaign).success) {
    throw new Error('The referenced campaign was not found')
  }
  const result = await dependencies.query({
    customerId, auth, maxRows: 100,
    query: `SELECT campaign_criterion.resource_name,
  campaign_criterion.campaign,
  campaign_criterion.negative,
  campaign_criterion.content_label.type
FROM campaign_criterion
WHERE campaign.id = ${campaignId}
  AND campaign_criterion.type = 'CONTENT_LABEL'
  AND campaign_criterion.negative = TRUE`
  })
  if (result.more > 0) throw new Error('Google Ads content-exclusion state exceeds the safe read limit')
  const labels = result.rows.map((row) => {
    const raw = row && typeof row === 'object' ? (row as Record<string, unknown>).campaignCriterion : undefined
    const parsed = z.object({
      resourceName: z.string(), campaign: z.literal(campaignResourceName), negative: z.literal(true),
      contentLabel: z.object({ type: ContentLabelTypeSchema })
    }).parse(raw)
    assertCustomerResourceName(parsed.resourceName, customerId, 'campaignCriteria', true)
    const [criterionCampaignId] = resourceIds(parsed.resourceName)
    if (criterionCampaignId !== campaignId) throw new Error('Google Ads returned a content label outside the selected campaign')
    return { resourceName: parsed.resourceName, type: parsed.contentLabel.type }
  }).sort((left, right) => left.type.localeCompare(right.type))
  return { campaignResourceName, labels }
}

async function loadAdGroupAudienceAssociations(
  customerId: string,
  adGroupResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<Record<string, unknown>> {
  assertCustomerResourceName(adGroupResourceName, customerId, 'adGroups')
  const [adGroupId] = resourceIds(adGroupResourceName)
  const parent = await dependencies.query({
    customerId, auth, maxRows: 1,
    query: `SELECT ad_group.resource_name,
  ad_group.audience_setting.use_audience_grouped,
  ad_group.targeting_setting.target_restrictions
FROM ad_group
WHERE ad_group.id = ${adGroupId}`
  })
  const rawAdGroup = parent.rows[0] && typeof parent.rows[0] === 'object'
    ? (parent.rows[0] as Record<string, unknown>).adGroup
    : undefined
  const adGroup = z.object({
    resourceName: z.literal(adGroupResourceName),
    audienceSetting: z.object({ useAudienceGrouped: z.boolean() }),
    targetingSetting: z.object({
      targetRestrictions: z.array(z.object({
        targetingDimension: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
        bidOnly: z.boolean()
      }))
    }).optional()
  }).safeParse(rawAdGroup)
  if (!adGroup.success) throw new Error('The referenced ad group or its audience settings were not found')
  const result = await dependencies.query({
    customerId, auth, maxRows: 1_000,
    query: `SELECT ad_group_criterion.resource_name,
  ad_group_criterion.ad_group,
  ad_group_criterion.negative,
  ad_group_criterion.audience.audience
FROM ad_group_criterion
WHERE ad_group.id = ${adGroupId}
  AND ad_group_criterion.type = 'AUDIENCE'
  AND ad_group_criterion.negative = FALSE`
  })
  if (result.more > 0) throw new Error('Google Ads audience-association state exceeds the safe read limit')
  const associations = result.rows.map((row) => {
    const raw = row && typeof row === 'object' ? (row as Record<string, unknown>).adGroupCriterion : undefined
    const parsed = z.object({
      resourceName: z.string(), adGroup: z.literal(adGroupResourceName), negative: z.literal(false),
      audience: z.object({ audience: z.string() })
    }).parse(raw)
    assertCustomerResourceName(parsed.resourceName, customerId, 'adGroupCriteria', true)
    assertCustomerResourceName(parsed.audience.audience, customerId, 'audiences')
    const [criterionAdGroupId] = resourceIds(parsed.resourceName)
    if (criterionAdGroupId !== adGroupId) throw new Error('Google Ads returned an audience outside the selected ad group')
    return { resourceName: parsed.resourceName, audienceResourceName: parsed.audience.audience }
  }).sort((left, right) => left.audienceResourceName.localeCompare(right.audienceResourceName))
  return {
    adGroupResourceName,
    audienceGrouped: adGroup.data.audienceSetting.useAudienceGrouped,
    targetRestrictions: adGroup.data.targetingSetting?.targetRestrictions ?? [],
    associations
  }
}

async function loadCampaignConversionGoals(
  customerId: string,
  campaignResourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{ campaignResourceName: string, goals: Array<Record<string, unknown>> }> {
  assertCustomerResourceName(campaignResourceName, customerId, 'campaigns')
  const [campaignId] = resourceIds(campaignResourceName)
  const parent = await dependencies.query({
    customerId, auth, maxRows: 1,
    query: `SELECT campaign.resource_name FROM campaign WHERE campaign.id = ${campaignId}`
  })
  const campaign = parent.rows[0] && typeof parent.rows[0] === 'object'
    ? (parent.rows[0] as Record<string, unknown>).campaign
    : undefined
  if (!z.object({ resourceName: z.literal(campaignResourceName) }).safeParse(campaign).success) {
    throw new Error('The referenced campaign was not found')
  }
  const result = await dependencies.query({
    customerId, auth, maxRows: 1_000,
    query: `SELECT campaign_conversion_goal.resource_name,
  campaign_conversion_goal.campaign,
  campaign_conversion_goal.category,
  campaign_conversion_goal.origin,
  campaign_conversion_goal.biddable
FROM campaign_conversion_goal
WHERE campaign.id = ${campaignId}`
  })
  if (result.more > 0) throw new Error('Google Ads campaign conversion-goal state exceeds the safe read limit')
  const goals = result.rows.map((row) => {
    const parsed = z.object({
      resourceName: z.string(), campaign: z.literal(campaignResourceName),
      category: ConversionGoalCategorySchema, origin: ConversionGoalOriginSchema, biddable: z.boolean()
    }).parse(row && typeof row === 'object' ? (row as Record<string, unknown>).campaignConversionGoal : undefined)
    const expected = `customers/${customerId}/campaignConversionGoals/${campaignId}~${parsed.category}~${parsed.origin}`
    if (parsed.resourceName !== expected) throw new Error('Google Ads returned a conversion goal outside the selected campaign')
    return { resourceName: parsed.resourceName, category: parsed.category, origin: parsed.origin, biddable: parsed.biddable }
  }).sort((left, right) => `${left.category}:${left.origin}`.localeCompare(`${right.category}:${right.origin}`))
  return { campaignResourceName, goals }
}

async function loadCustomerConversionGoal(
  customerId: string,
  category: z.infer<typeof ConversionGoalCategorySchema>,
  origin: z.infer<typeof ConversionGoalOriginSchema>,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<Record<string, unknown>> {
  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT customer_conversion_goal.resource_name,
  customer_conversion_goal.category,
  customer_conversion_goal.origin,
  customer_conversion_goal.biddable
FROM customer_conversion_goal
WHERE customer_conversion_goal.category = '${category}'
  AND customer_conversion_goal.origin = '${origin}'`
  })
  if (result.more > 0 || result.rows.length !== 1) {
    throw new Error('Google Ads customer conversion goal was not found uniquely')
  }
  const row = result.rows[0]
  const parsed = z.object({
    resourceName: z.string(),
    category: z.literal(category),
    origin: z.literal(origin),
    biddable: z.boolean()
  }).safeParse(row && typeof row === 'object' ? (row as Record<string, unknown>).customerConversionGoal : undefined)
  const expected = `customers/${customerId}/customerConversionGoals/${category}~${origin}`
  if (!parsed.success || parsed.data.resourceName !== expected) {
    throw new Error('Google Ads returned a customer conversion goal outside the selected customer')
  }
  return parsed.data
}

async function loadConversionAction(
  customerId: string,
  resourceName: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<z.infer<typeof ConversionActionStateSchema>> {
  assertCustomerResourceName(resourceName, customerId, 'conversionActions')
  const [conversionActionId] = resourceIds(resourceName)
  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT conversion_action.resource_name,
  conversion_action.name,
  conversion_action.status,
  conversion_action.type,
  conversion_action.category,
  conversion_action.origin,
  conversion_action.primary_for_goal,
  conversion_action.include_in_conversions_metric,
  conversion_action.counting_type,
  conversion_action.click_through_lookback_window_days,
  conversion_action.view_through_lookback_window_days
FROM conversion_action
WHERE conversion_action.id = ${conversionActionId}`
  })
  const first = result.rows[0]
  const conversionAction = first && typeof first === 'object'
    ? (first as Record<string, unknown>).conversionAction
    : undefined
  const parsed = ConversionActionStateSchema.safeParse(conversionAction)
  if (!parsed.success || parsed.data.resourceName !== resourceName) {
    throw new Error('Google Ads conversion action was not found')
  }
  return parsed.data
}

async function assertConversionActionNameAvailable(
  customerId: string,
  name: string,
  auth: GoogleAdsAuth,
  dependencies: SearchStateDependencies
): Promise<{ exists: false }> {
  const result = await dependencies.query({
    customerId,
    auth,
    maxRows: 1,
    query: `SELECT conversion_action.resource_name
FROM conversion_action
WHERE conversion_action.name = '${escapeGaqlString(name)}'`
  })
  if (result.rows.length > 0 || result.more > 0) {
    throw new Error(`A Google Ads conversion action named "${name}" already exists`)
  }
  return { exists: false }
}

export async function loadSearchGoogleAdsCurrentState(
  context: Omit<BuildGoogleAdsActionContext, 'currentState'>,
  auth: GoogleAdsAuth,
  dependencies: Partial<SearchStateDependencies> = {}
): Promise<unknown> {
  const resolved = { ...defaultDependencies, ...dependencies }
  if (isStatusReadOperation(context.input.operation)) {
    return loadStatus(context, auth, resolved)
  }
  if (context.input.operation === 'add_negative_keywords') {
    return loadNegativeKeywords(context, auth, resolved)
  }
  if (context.input.operation === 'create_budget') {
    const args = z.object({ name: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation,
      context.input.arguments
    ))
    return assertBudgetNameAvailable(context.customerId, args.name, auth, resolved)
  }
  if (context.input.operation === 'update_budget') {
    const args = z.object({ resourceName: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation,
      context.input.arguments
    ))
    return loadBudgetByResourceName(
      context.customerId,
      args.resourceName,
      auth,
      resolved
    )
  }
  if (context.input.operation === 'create_campaign') {
    const args = z.object({
      name: z.string(),
      budgetResourceName: z.string()
    }).parse(parseSearchGoogleAdsArguments(
      context.input.operation,
      context.input.arguments
    ))
    return loadCreateCampaignCurrentState(
      context.customerId,
      args.name,
      args.budgetResourceName,
      auth,
      resolved
    )
  }
  if (context.input.operation === 'create_ad_group') {
    const args = z.object({
      name: z.string(),
      campaignResourceName: z.string()
    }).parse(parseSearchGoogleAdsArguments(
      context.input.operation,
      context.input.arguments
    ))
    return loadCreateAdGroupCurrentState(
      context.customerId,
      args.name,
      args.campaignResourceName,
      auth,
      resolved
    )
  }
  if (context.input.operation === 'create_ad') {
    const args = z.object({
      adGroupResourceName: z.string()
    }).parse(parseSearchGoogleAdsArguments(
      context.input.operation,
      context.input.arguments
    ))
    return loadCreateAdCurrentState(
      context.customerId,
      args.adGroupResourceName,
      auth,
      resolved
    )
  }
  if (context.input.operation === 'add_keywords') {
    const args = z.object({
      adGroupResourceName: z.string()
    }).parse(parseSearchGoogleAdsArguments(
      context.input.operation,
      context.input.arguments
    ))
    return loadPositiveKeywords(
      context.customerId,
      args.adGroupResourceName,
      auth,
      resolved
    )
  }
  if (context.input.operation === 'set_locations') {
    const args = z.object({ campaignResourceName: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation,
      context.input.arguments
    ))
    return loadCampaignLocations(
      context.customerId,
      args.campaignResourceName,
      auth,
      resolved
    )
  }
  if (context.input.operation === 'set_location_match_mode') {
    const args = z.object({ campaignResourceName: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation,
      context.input.arguments
    ))
    return loadCampaignLocationMatchMode(
      context.customerId,
      args.campaignResourceName,
      auth,
      resolved
    )
  }
  if (context.input.operation === 'set_languages') {
    const args = z.object({ campaignResourceName: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation,
      context.input.arguments
    ))
    return loadCampaignLanguages(
      context.customerId,
      args.campaignResourceName,
      auth,
      resolved
    )
  }
  if (context.input.operation === 'set_ad_schedule') {
    const args = z.object({ campaignResourceName: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation,
      context.input.arguments
    ))
    return loadCampaignAdSchedules(
      context.customerId,
      args.campaignResourceName,
      auth,
      resolved
    )
  }
  if (context.input.operation === 'set_devices') {
    const args = z.object({ campaignResourceName: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation,
      context.input.arguments
    ))
    return loadCampaignDevices(
      context.customerId,
      args.campaignResourceName,
      auth,
      resolved
    )
  }
  if (context.input.operation === 'set_demographics') {
    const args = z.object({ adGroupResourceName: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation, context.input.arguments
    ))
    return loadAdGroupDemographics(context.customerId, args.adGroupResourceName, auth, resolved)
  }
  if (context.input.operation === 'set_placements') {
    const args = z.object({
      scope: z.enum(['campaign', 'ad_group']), parentResourceName: z.string()
    }).parse(parseSearchGoogleAdsArguments(context.input.operation, context.input.arguments))
    return loadPlacementExclusions(context.customerId, args.scope, args.parentResourceName, auth, resolved)
  }
  if (context.input.operation === 'set_content_exclusions') {
    const args = z.object({ campaignResourceName: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation, context.input.arguments
    ))
    return loadCampaignContentExclusions(context.customerId, args.campaignResourceName, auth, resolved)
  }
  if (context.input.operation === 'set_audience_associations') {
    const args = z.object({ adGroupResourceName: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation, context.input.arguments
    ))
    return loadAdGroupAudienceAssociations(context.customerId, args.adGroupResourceName, auth, resolved)
  }
  if (context.input.operation === 'set_campaign_conversion_goals') {
    const args = z.object({ campaignResourceName: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation, context.input.arguments
    ))
    return loadCampaignConversionGoals(context.customerId, args.campaignResourceName, auth, resolved)
  }
  if (context.input.operation === 'set_customer_goal_biddability') {
    const args = z.object({
      category: ConversionGoalCategorySchema,
      origin: ConversionGoalOriginSchema
    }).parse(parseSearchGoogleAdsArguments(context.input.operation, context.input.arguments))
    return loadCustomerConversionGoal(context.customerId, args.category, args.origin, auth, resolved)
  }
  if (context.input.operation === 'set_conversion_primary_state') {
    const args = z.object({ resourceName: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation, context.input.arguments
    ))
    return loadConversionAction(context.customerId, args.resourceName, auth, resolved)
  }
  if (context.input.operation === 'update_conversion_action') {
    const args = z.object({ resourceName: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation, context.input.arguments
    ))
    return loadConversionAction(context.customerId, args.resourceName, auth, resolved)
  }
  if (context.input.operation === 'create_conversion_action') {
    const args = z.object({ name: z.string() }).parse(parseSearchGoogleAdsArguments(
      context.input.operation, context.input.arguments
    ))
    return assertConversionActionNameAvailable(context.customerId, args.name, auth, resolved)
  }
  throw new Error(`Unsupported Search Google Ads operation: ${context.input.operation}`)
}

export async function loadSearchGoogleAdsPlanState(
  plan: GoogleAdsActionPlan,
  auth: GoogleAdsAuth,
  dependencies: Partial<SearchStateDependencies> = {},
  mutation?: GoogleAdsMutateResult
): Promise<unknown> {
  const resolved = { ...defaultDependencies, ...dependencies }
  if (plan.operation === 'create_conversion_action') {
    if (mutation) {
      return loadConversionAction(
        plan.customerId,
        mutationResourceName(mutation, 'conversionActions'),
        auth,
        resolved
      )
    }
    const desired = z.object({ name: z.string() }).parse(plan.desiredState)
    return assertConversionActionNameAvailable(plan.customerId, desired.name, auth, resolved)
  }
  if (plan.operation === 'create_budget') {
    if (mutation) {
      return loadBudgetByResourceName(
        plan.customerId,
        mutationResourceName(mutation, 'campaignBudgets'),
        auth,
        resolved
      )
    }
    const desired = z.object({ name: z.string() }).parse(plan.desiredState)
    return assertBudgetNameAvailable(plan.customerId, desired.name, auth, resolved)
  }
  if (plan.operation === 'update_budget') {
    if (!plan.resourceName) throw new Error('Budget update plan has no resource name')
    return loadBudgetByResourceName(
      plan.customerId,
      plan.resourceName,
      auth,
      resolved
    )
  }
  if (plan.operation === 'create_campaign') {
    if (mutation) {
      return loadCampaignByResourceName(
        plan.customerId,
        mutationResourceName(mutation, 'campaigns'),
        auth,
        resolved
      )
    }
    const desired = z.object({
      name: z.string(),
      campaignBudget: z.string()
    }).parse(plan.desiredState)
    return loadCreateCampaignCurrentState(
      plan.customerId,
      desired.name,
      desired.campaignBudget,
      auth,
      resolved
    )
  }
  if (plan.operation === 'create_ad_group') {
    if (mutation) {
      return loadAdGroupByResourceName(
        plan.customerId,
        mutationResourceName(mutation, 'adGroups'),
        auth,
        resolved
      )
    }
    const desired = z.object({
      name: z.string(),
      campaign: z.string()
    }).parse(plan.desiredState)
    return loadCreateAdGroupCurrentState(
      plan.customerId,
      desired.name,
      desired.campaign,
      auth,
      resolved
    )
  }
  if (plan.operation === 'create_ad') {
    if (mutation) {
      return loadAdGroupAdByResourceName(
        plan.customerId,
        mutationResourceName(mutation, 'adGroupAds'),
        auth,
        resolved
      )
    }
    const desired = z.object({ adGroup: z.string() }).parse(plan.desiredState)
    return loadCreateAdCurrentState(
      plan.customerId,
      desired.adGroup,
      auth,
      resolved
    )
  }
  if (plan.operation === 'add_keywords') {
    const desired = z.object({ adGroupResourceName: z.string() }).parse(plan.desiredState)
    return loadPositiveKeywords(
      plan.customerId,
      desired.adGroupResourceName,
      auth,
      resolved
    )
  }
  if (plan.operation === 'set_locations') {
    const desired = z.object({ campaignResourceName: z.string() }).parse(plan.desiredState)
    return loadCampaignLocations(
      plan.customerId,
      desired.campaignResourceName,
      auth,
      resolved
    )
  }
  if (plan.operation === 'set_location_match_mode') {
    const desired = z.object({ campaignResourceName: z.string() }).parse(plan.desiredState)
    return loadCampaignLocationMatchMode(
      plan.customerId,
      desired.campaignResourceName,
      auth,
      resolved
    )
  }
  if (plan.operation === 'set_languages') {
    const desired = z.object({ campaignResourceName: z.string() }).parse(plan.desiredState)
    return loadCampaignLanguages(
      plan.customerId,
      desired.campaignResourceName,
      auth,
      resolved
    )
  }
  if (plan.operation === 'set_ad_schedule') {
    const desired = z.object({ campaignResourceName: z.string() }).parse(plan.desiredState)
    return loadCampaignAdSchedules(
      plan.customerId,
      desired.campaignResourceName,
      auth,
      resolved
    )
  }
  if (plan.operation === 'set_devices') {
    const desired = z.object({ campaignResourceName: z.string() }).parse(plan.desiredState)
    return loadCampaignDevices(
      plan.customerId,
      desired.campaignResourceName,
      auth,
      resolved
    )
  }
  if (plan.operation === 'set_demographics') {
    const desired = z.object({ adGroupResourceName: z.string() }).parse(plan.desiredState)
    return loadAdGroupDemographics(plan.customerId, desired.adGroupResourceName, auth, resolved)
  }
  if (plan.operation === 'set_placements') {
    const desired = z.object({
      scope: z.enum(['campaign', 'ad_group']), parentResourceName: z.string()
    }).parse(plan.desiredState)
    return loadPlacementExclusions(plan.customerId, desired.scope, desired.parentResourceName, auth, resolved)
  }
  if (plan.operation === 'set_content_exclusions') {
    const desired = z.object({ campaignResourceName: z.string() }).parse(plan.desiredState)
    return loadCampaignContentExclusions(plan.customerId, desired.campaignResourceName, auth, resolved)
  }
  if (plan.operation === 'set_audience_associations') {
    const desired = z.object({ adGroupResourceName: z.string() }).parse(plan.desiredState)
    return loadAdGroupAudienceAssociations(plan.customerId, desired.adGroupResourceName, auth, resolved)
  }
  if (plan.operation === 'set_campaign_conversion_goals') {
    const desired = z.object({ campaignResourceName: z.string() }).parse(plan.desiredState)
    return loadCampaignConversionGoals(plan.customerId, desired.campaignResourceName, auth, resolved)
  }
  if (plan.operation === 'set_customer_goal_biddability') {
    const desired = z.object({
      category: ConversionGoalCategorySchema,
      origin: ConversionGoalOriginSchema
    }).parse(plan.desiredState)
    return loadCustomerConversionGoal(plan.customerId, desired.category, desired.origin, auth, resolved)
  }
  if (plan.operation === 'set_conversion_primary_state') {
    if (!plan.resourceName) throw new Error('Conversion action plan has no resource name')
    return loadConversionAction(plan.customerId, plan.resourceName, auth, resolved)
  }
  if (plan.operation === 'update_conversion_action') {
    if (!plan.resourceName) throw new Error('Conversion action plan has no resource name')
    return loadConversionAction(plan.customerId, plan.resourceName, auth, resolved)
  }
  if (!plan.resourceName) throw new Error('Search Google Ads plan has no resource name')
  const negative = plan.operation === 'add_negative_keywords'
  const service = plan.providerOperations[0]?.service
  const argumentsValue = negative
    ? {
        scope: service === 'campaignCriteria' ? 'campaign' as const : 'ad_group' as const,
        parentResourceName: plan.resourceName,
        keywords: [{ text: '__state_probe__', matchType: 'EXACT' as const }]
      }
    : { resourceName: plan.resourceName }

  return loadSearchGoogleAdsCurrentState({
    input: {
      clientId: plan.clientId,
      connectionId: plan.connectionId,
      actorId: plan.actorId,
      source: plan.source,
      operation: plan.operation,
      resourceType: plan.resourceType,
      requestedMode: plan.executionMode === 'automatic' ? 'automatic' : 'proposal',
      arguments: argumentsValue,
      idempotencyKey: plan.idempotencyKey
    },
    connection: {
      clientId: plan.clientId,
      connectionId: plan.connectionId,
      customerId: plan.customerId,
      platform: 'google',
      status: 'active'
    },
    customerId: plan.customerId
  }, auth, dependencies)
}

function normalizeVerificationState(value: unknown): unknown {
  const criteriaState = z.object({ criteria: z.array(CriterionSchema) }).safeParse(value)
  if (!criteriaState.success) return value
  return {
    criteria: [...criteriaState.data.criteria].sort((left, right) => {
      const leftKey = `${left.matchType}:${left.text.toLocaleLowerCase('en-AU')}`
      const rightKey = `${right.matchType}:${right.text.toLocaleLowerCase('en-AU')}`
      return leftKey.localeCompare(rightKey)
    })
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function projectActualToExpected(expected: unknown, actual: unknown): unknown {
  if (isPlainObject(expected) && isPlainObject(actual)) {
    const projected: Record<string, unknown> = {}
    for (const key of Object.keys(expected)) {
      if (Object.hasOwn(actual, key)) {
        projected[key] = projectActualToExpected(expected[key], actual[key])
      }
    }
    return projected
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return actual.map((value, index) => (
      index < expected.length ? projectActualToExpected(expected[index], value) : value
    ))
  }
  return actual
}

export function verifySearchGoogleAdsState(
  expected: unknown,
  actual: unknown
): { ok: boolean, diffs: GoogleAdsVerificationDiff[] } {
  const normalizedExpected = normalizeVerificationState(expected)
  const normalizedActual = normalizeVerificationState(actual)
  const differences = diffGoogleAdsStates(
    normalizedExpected,
    projectActualToExpected(normalizedExpected, normalizedActual)
  )
  const diffs = differences.map(diff => ({
    field: diff.field,
    expected: diff.before,
    actual: diff.after
  }))
  return { ok: diffs.length === 0, diffs }
}
