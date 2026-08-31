import { z } from 'zod'
import type {
  BuildGoogleAdsActionContext,
  BuiltGoogleAdsAction
} from '~~/server/utils/googleAds/actionPlanner'
import type { GoogleAdsOperationType } from '~~/server/utils/googleAds/contracts'

const ResourceNameArgumentsSchema = z.strictObject({
  resourceName: z.string().trim().min(1).max(1_000),
  status: z.enum(['ENABLED', 'PAUSED']).optional()
})

const NegativeKeywordSchema = z.strictObject({
  text: z.string().trim().min(1).max(80),
  matchType: z.enum(['EXACT', 'PHRASE', 'BROAD'])
})

const NegativeKeywordArgumentsSchema = z.strictObject({
  scope: z.enum(['campaign', 'ad_group']),
  parentResourceName: z.string().trim().min(1).max(1_000),
  keywords: z.array(NegativeKeywordSchema).min(1).max(100)
})
const CreateBudgetArgumentsSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  dailyAmount: z.number().finite().positive().max(1_000_000)
})
const UpdateBudgetArgumentsSchema = z.strictObject({
  resourceName: z.string().trim().min(1).max(1_000),
  dailyAmount: z.number().finite().positive().max(1_000_000)
})
const CreateCampaignArgumentsSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  budgetResourceName: z.string().trim().min(1).max(1_000),
  includeSearchPartners: z.boolean().default(false),
  startDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/).optional(),
  endDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/).optional()
})
const CreateAdGroupArgumentsSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  campaignResourceName: z.string().trim().min(1).max(1_000),
  cpcBid: z.number().finite().positive().max(1_000_000).optional()
})
const PositiveKeywordArgumentsSchema = z.strictObject({
  adGroupResourceName: z.string().trim().min(1).max(1_000),
  keywords: z.array(NegativeKeywordSchema).min(1).max(100)
})
const CreateResponsiveSearchAdArgumentsSchema = z.strictObject({
  adGroupResourceName: z.string().trim().min(1).max(1_000),
  finalUrl: z.string().url().refine(value => value.startsWith('https://')),
  headlines: z.array(z.string().trim().min(1).max(30)).min(3).max(15),
  descriptions: z.array(z.string().trim().min(1).max(90)).min(2).max(4),
  path1: z.string().trim().min(1).max(15).optional(),
  path2: z.string().trim().min(1).max(15).optional()
}).superRefine((value, context) => {
  if (new Set(value.headlines.map(text => text.toLocaleLowerCase('en-AU'))).size !== value.headlines.length) {
    context.addIssue({ code: 'custom', message: 'Responsive search ad headlines must be unique' })
  }
  if (new Set(value.descriptions.map(text => text.toLocaleLowerCase('en-AU'))).size !== value.descriptions.length) {
    context.addIssue({ code: 'custom', message: 'Responsive search ad descriptions must be unique' })
  }
})
const SetLocationsArgumentsSchema = z.strictObject({
  campaignResourceName: z.string().trim().min(1).max(1_000),
  geoTargetConstantIds: z.array(z.string().regex(/^\d{1,20}$/)).min(1).max(1_000)
})
const SetLocationMatchModeArgumentsSchema = z.strictObject({
  campaignResourceName: z.string().trim().min(1).max(1_000),
  positiveGeoTargetType: z.enum(['PRESENCE', 'PRESENCE_OR_INTEREST'])
})
const SetLanguagesArgumentsSchema = z.strictObject({
  campaignResourceName: z.string().trim().min(1).max(1_000),
  languageConstantIds: z.array(z.string().regex(/^\d{1,20}$/)).min(1).max(1_000)
})
const DayOfWeekSchema = z.enum([
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'
])
const QuarterHourSchema = z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(45)])
const AdScheduleSchema = z.strictObject({
  dayOfWeek: DayOfWeekSchema,
  startHour: z.number().int().min(0).max(23),
  startMinute: QuarterHourSchema,
  endHour: z.number().int().min(0).max(24),
  endMinute: QuarterHourSchema
})
const SetAdScheduleArgumentsSchema = z.strictObject({
  campaignResourceName: z.string().trim().min(1).max(1_000),
  schedules: z.array(AdScheduleSchema).min(1).max(42)
}).superRefine((value, refinement) => {
  const byDay = new Map<string, Array<{ start: number, end: number }>>()
  for (const schedule of value.schedules) {
    const start = schedule.startHour * 60 + schedule.startMinute
    const end = schedule.endHour * 60 + schedule.endMinute
    if (schedule.endHour === 24 && schedule.endMinute !== 0) {
      refinement.addIssue({ code: 'custom', message: 'An ad schedule ending at hour 24 must end at minute 0' })
    }
    if (end <= start) {
      refinement.addIssue({ code: 'custom', message: 'Each ad schedule must end after it starts' })
    }
    const entries = byDay.get(schedule.dayOfWeek) ?? []
    entries.push({ start, end })
    byDay.set(schedule.dayOfWeek, entries)
  }
  for (const entries of byDay.values()) {
    entries.sort((left, right) => left.start - right.start)
    if (entries.length > 6) {
      refinement.addIssue({ code: 'custom', message: 'Google Ads permits at most six ad schedules per day' })
    }
    for (let index = 1; index < entries.length; index += 1) {
      if (entries[index]!.start < entries[index - 1]!.end) {
        refinement.addIssue({ code: 'custom', message: 'Campaign ad schedules must not overlap' })
      }
    }
  }
})

type AdSchedule = z.infer<typeof AdScheduleSchema>

const DAY_ORDER: Record<AdSchedule['dayOfWeek'], number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6
}
const MINUTE_ENUM = { 0: 'ZERO', 15: 'FIFTEEN', 30: 'THIRTY', 45: 'FORTY_FIVE' } as const

function scheduleKey(schedule: AdSchedule): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${schedule.dayOfWeek}:${pad(schedule.startHour)}:${pad(schedule.startMinute)}-${pad(schedule.endHour)}:${pad(schedule.endMinute)}`
}

function sortSchedules(schedules: AdSchedule[]): AdSchedule[] {
  return [...schedules].sort((left, right) => (
    DAY_ORDER[left.dayOfWeek] - DAY_ORDER[right.dayOfWeek]
    || left.startHour - right.startHour
    || left.startMinute - right.startMinute
    || left.endHour - right.endHour
    || left.endMinute - right.endMinute
  ))
}
const DeviceTypeSchema = z.enum(['MOBILE', 'DESKTOP', 'TABLET', 'CONNECTED_TV', 'OTHER'])
const BidModifierSchema = z.number().finite().refine(
  value => value === 0 || (value >= 0.1 && value <= 10),
  { message: 'Device bid modifier must be 0 or between 0.1 and 10' }
)
const SetDevicesArgumentsSchema = z.strictObject({
  campaignResourceName: z.string().trim().min(1).max(1_000),
  devices: z.array(z.strictObject({
    type: DeviceTypeSchema,
    bidModifier: BidModifierSchema
  })).min(1).max(5)
}).superRefine((value, refinement) => {
  if (new Set(value.devices.map(device => device.type)).size !== value.devices.length) {
    refinement.addIssue({ code: 'custom', message: 'Each device type may be specified only once' })
  }
})
const AgeRangeTypeSchema = z.enum([
  'AGE_RANGE_18_24', 'AGE_RANGE_25_34', 'AGE_RANGE_35_44', 'AGE_RANGE_45_54',
  'AGE_RANGE_55_64', 'AGE_RANGE_65_UP', 'AGE_RANGE_UNDETERMINED'
])
const GenderTypeSchema = z.enum(['FEMALE', 'MALE', 'UNDETERMINED'])
const DemographicCriterionSchema = z.discriminatedUnion('dimension', [
  z.strictObject({ dimension: z.literal('AGE_RANGE'), type: AgeRangeTypeSchema, excluded: z.boolean() }),
  z.strictObject({ dimension: z.literal('GENDER'), type: GenderTypeSchema, excluded: z.boolean() })
])
const SetDemographicsArgumentsSchema = z.strictObject({
  adGroupResourceName: z.string().trim().min(1).max(1_000),
  criteria: z.array(DemographicCriterionSchema).max(20)
}).superRefine((value, refinement) => {
  const keys = value.criteria.map(criterion => `${criterion.dimension}:${criterion.type}`)
  if (new Set(keys).size !== keys.length) {
    refinement.addIssue({ code: 'custom', message: 'Each demographic criterion may be specified only once' })
  }
})
const PlacementUrlSchema = z.string().trim().min(1).max(250).url().refine((value) => {
  const protocol = new URL(value).protocol
  return protocol === 'http:' || protocol === 'https:'
}, { message: 'Placement URLs must use HTTP or HTTPS' })
const SetPlacementsArgumentsSchema = z.strictObject({
  scope: z.enum(['campaign', 'ad_group']),
  parentResourceName: z.string().trim().min(1).max(1_000),
  urls: z.array(PlacementUrlSchema).max(1_000)
}).superRefine((value, refinement) => {
  if (new Set(value.urls).size !== value.urls.length) {
    refinement.addIssue({ code: 'custom', message: 'Placement URLs must be unique' })
  }
})
const ContentLabelTypeSchema = z.enum([
  'BELOW_THE_FOLD', 'BRAND_SUITABILITY_CONTENT_FOR_FAMILIES', 'BRAND_SUITABILITY_GAMES_FIGHTING',
  'BRAND_SUITABILITY_GAMES_MATURE', 'BRAND_SUITABILITY_HEALTH_SENSITIVE',
  'BRAND_SUITABILITY_HEALTH_SOURCE_UNDETERMINED', 'LIVE_STREAMING_VIDEO', 'PARKED_DOMAIN',
  'PROFANITY', 'SEXUALLY_SUGGESTIVE', 'SOCIAL_ISSUES', 'TRAGEDY', 'VIDEO', 'VIDEO_NOT_YET_RATED',
  'VIDEO_RATING_DV_G', 'VIDEO_RATING_DV_MA', 'VIDEO_RATING_DV_PG', 'VIDEO_RATING_DV_T'
])
const SetContentExclusionsArgumentsSchema = z.strictObject({
  campaignResourceName: z.string().trim().min(1).max(1_000),
  labels: z.array(ContentLabelTypeSchema).max(18)
}).superRefine((value, refinement) => {
  if (new Set(value.labels).size !== value.labels.length) {
    refinement.addIssue({ code: 'custom', message: 'Content-exclusion labels must be unique' })
  }
})
const SetAudienceAssociationsArgumentsSchema = z.strictObject({
  adGroupResourceName: z.string().trim().min(1).max(1_000),
  audienceResourceNames: z.array(z.string().trim().min(1).max(1_000)).max(1_000),
  mode: z.enum(['TARGETING', 'OBSERVATION'])
}).superRefine((value, refinement) => {
  if (new Set(value.audienceResourceNames).size !== value.audienceResourceNames.length) {
    refinement.addIssue({ code: 'custom', message: 'Audience resource names must be unique' })
  }
})
const ConversionCategorySchema = z.enum([
  'ADD_TO_CART', 'BEGIN_CHECKOUT', 'BOOK_APPOINTMENT', 'CONTACT', 'CONVERTED_LEAD', 'DEFAULT',
  'DOWNLOAD', 'ENGAGEMENT', 'GET_DIRECTIONS', 'IMPORTED_LEAD', 'OUTBOUND_CLICK', 'PAGE_VIEW',
  'PHONE_CALL_LEAD', 'PURCHASE', 'QUALIFIED_LEAD', 'REQUEST_QUOTE', 'SIGNUP', 'STORE_SALE',
  'STORE_VISIT', 'SUBMIT_LEAD_FORM', 'SUBSCRIBE_PAID', 'YOUTUBE_FOLLOW_ON_VIEWS'
])
const ConversionOriginSchema = z.enum([
  'APP', 'CALL_FROM_ADS', 'GOOGLE_HOSTED', 'LOCAL_SERVICES_ADS', 'STORE', 'WEBSITE', 'YOUTUBE_HOSTED'
])
const SetCampaignConversionGoalsArgumentsSchema = z.strictObject({
  campaignResourceName: z.string().trim().min(1).max(1_000),
  goals: z.array(z.strictObject({
    category: ConversionCategorySchema,
    origin: ConversionOriginSchema,
    biddable: z.boolean()
  })).min(1).max(200)
}).superRefine((value, refinement) => {
  const keys = value.goals.map(goal => `${goal.category}:${goal.origin}`)
  if (new Set(keys).size !== keys.length) {
    refinement.addIssue({ code: 'custom', message: 'Each campaign conversion goal may be specified only once' })
  }
})
const SetCustomerGoalBiddabilityArgumentsSchema = z.strictObject({
  category: ConversionCategorySchema,
  origin: ConversionOriginSchema,
  biddable: z.boolean()
})
const SetConversionPrimaryStateArgumentsSchema = z.strictObject({
  resourceName: z.string().trim().min(1).max(1_000),
  primaryForGoal: z.boolean()
})
const CreateConversionActionArgumentsSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  type: z.enum(['WEBPAGE', 'UPLOAD_CLICKS', 'UPLOAD_CALLS', 'WEBSITE_CALL']),
  category: ConversionCategorySchema,
  countingType: z.enum(['ONE_PER_CLICK', 'MANY_PER_CLICK']),
  clickThroughLookbackWindowDays: z.number().int().min(1).max(90).default(30),
  viewThroughLookbackWindowDays: z.number().int().min(1).max(30).optional()
}).superRefine((value, refinement) => {
  if (value.type !== 'WEBPAGE' && value.viewThroughLookbackWindowDays !== undefined) {
    refinement.addIssue({ code: 'custom', message: 'View-through windows are supported only for WEBPAGE conversion actions' })
  }
})
const UpdateConversionActionArgumentsSchema = z.strictObject({
  resourceName: z.string().trim().min(1).max(1_000),
  name: z.string().trim().min(1).max(255).optional(),
  category: ConversionCategorySchema.optional(),
  status: z.enum(['ENABLED', 'HIDDEN']).optional(),
  countingType: z.enum(['ONE_PER_CLICK', 'MANY_PER_CLICK']).optional(),
  clickThroughLookbackWindowDays: z.number().int().min(1).max(90).optional(),
  viewThroughLookbackWindowDays: z.number().int().min(1).max(30).optional()
}).superRefine((value, refinement) => {
  if (
    value.name === undefined
    && value.category === undefined
    && value.status === undefined
    && value.countingType === undefined
    && value.clickThroughLookbackWindowDays === undefined
    && value.viewThroughLookbackWindowDays === undefined
  ) {
    refinement.addIssue({ code: 'custom', message: 'At least one mutable conversion-action field is required' })
  }
})
const MutableConversionActionStateSchema = z.object({
  resourceName: z.string(),
  name: z.string(),
  status: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  type: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  category: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  origin: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  primaryForGoal: z.boolean(),
  includeInConversionsMetric: z.boolean(),
  countingType: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
  clickThroughLookbackWindowDays: z.string().optional(),
  viewThroughLookbackWindowDays: z.string().optional()
})

const STATUS_OPERATIONS = {
  pause_campaign: { resourceType: 'campaign', segment: 'campaigns', service: 'campaigns', status: 'PAUSED' },
  archive_campaign: { resourceType: 'campaign', segment: 'campaigns', service: 'campaigns', status: 'PAUSED' },
  enable_campaign: { resourceType: 'campaign', segment: 'campaigns', service: 'campaigns', status: 'ENABLED' },
  set_campaign_status: { resourceType: 'campaign', segment: 'campaigns', service: 'campaigns' },
  pause_ad_group: { resourceType: 'ad_group', segment: 'adGroups', service: 'adGroups', status: 'PAUSED' },
  archive_ad_group: { resourceType: 'ad_group', segment: 'adGroups', service: 'adGroups', status: 'PAUSED' },
  enable_ad_group: { resourceType: 'ad_group', segment: 'adGroups', service: 'adGroups', status: 'ENABLED' },
  set_ad_group_status: { resourceType: 'ad_group', segment: 'adGroups', service: 'adGroups' },
  pause_ad: { resourceType: 'ad', segment: 'adGroupAds', service: 'adGroupAds', status: 'PAUSED' },
  archive_ad: { resourceType: 'ad', segment: 'adGroupAds', service: 'adGroupAds', status: 'PAUSED' },
  enable_ad: { resourceType: 'ad', segment: 'adGroupAds', service: 'adGroupAds', status: 'ENABLED' },
  update_ad_status: { resourceType: 'ad', segment: 'adGroupAds', service: 'adGroupAds' },
  pause_keyword: { resourceType: 'keyword', segment: 'adGroupCriteria', service: 'adGroupCriteria', status: 'PAUSED' },
  enable_keyword: { resourceType: 'keyword', segment: 'adGroupCriteria', service: 'adGroupCriteria', status: 'ENABLED' },
  set_keyword_status: { resourceType: 'keyword', segment: 'adGroupCriteria', service: 'adGroupCriteria' }
} as const

type StatusOperation = keyof typeof STATUS_OPERATIONS

function isStatusOperation(operation: GoogleAdsOperationType): operation is StatusOperation {
  return Object.hasOwn(STATUS_OPERATIONS, operation)
}

export function isSearchGoogleAdsOperation(operation: GoogleAdsOperationType): boolean {
  return isStatusOperation(operation)
    || [
      'add_negative_keywords',
      'create_budget',
      'update_budget',
      'create_campaign',
      'create_ad_group',
      'create_ad',
      'add_keywords',
      'set_locations',
      'set_location_match_mode',
      'set_languages',
      'set_ad_schedule',
      'set_devices',
      'set_demographics',
      'set_placements',
      'set_content_exclusions',
      'set_audience_associations',
      'set_campaign_conversion_goals',
      'set_customer_goal_biddability',
      'set_conversion_primary_state',
      'create_conversion_action',
      'update_conversion_action'
    ].includes(operation)
}

function resourcePattern(customerId: string, segment: string): RegExp {
  const suffix = segment === 'adGroupAds'
    || segment === 'adGroupCriteria'
    || segment === 'campaignCriteria'
    ? '\\d+~\\d+'
    : '\\d+'
  return new RegExp(`^customers/${customerId}/${segment}/${suffix}$`)
}

function assertResourceName(resourceName: string, customerId: string, segment: string): void {
  if (!resourcePattern(customerId, segment).test(resourceName)) {
    throw new Error('Resource does not belong to the selected Google Ads customer')
  }
}

function normalizeKeywordText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function keywordKey(keyword: { text: string, matchType: string }): string {
  return `${keyword.matchType}:${keyword.text.toLocaleLowerCase('en-AU')}`
}

function parseCurrentCriteria(value: unknown): Array<{ text: string, matchType: 'EXACT' | 'PHRASE' | 'BROAD', negative: true }> {
  if (!value || typeof value !== 'object' || !('criteria' in value) || !Array.isArray(value.criteria)) return []
  const criteria: Array<{ text: string, matchType: 'EXACT' | 'PHRASE' | 'BROAD', negative: true }> = []
  for (const item of value.criteria) {
    const parsed = z.object({
      text: z.string(),
      matchType: z.enum(['EXACT', 'PHRASE', 'BROAD']),
      negative: z.literal(true)
    }).safeParse(item)
    if (parsed.success) criteria.push(parsed.data)
  }
  return criteria
}

function parseCurrentPositiveCriteria(value: unknown): Array<{
  text: string
  matchType: 'EXACT' | 'PHRASE' | 'BROAD'
  negative: false
  status: 'ENABLED' | 'PAUSED'
}> {
  if (!value || typeof value !== 'object' || !('criteria' in value) || !Array.isArray(value.criteria)) return []
  const criteria: Array<{
    text: string
    matchType: 'EXACT' | 'PHRASE' | 'BROAD'
    negative: false
    status: 'ENABLED' | 'PAUSED'
  }> = []
  for (const item of value.criteria) {
    const parsed = z.object({
      text: z.string(),
      matchType: z.enum(['EXACT', 'PHRASE', 'BROAD']),
      negative: z.literal(false),
      status: z.enum(['ENABLED', 'PAUSED'])
    }).safeParse(item)
    if (parsed.success) criteria.push(parsed.data)
  }
  return criteria
}

export function parseSearchGoogleAdsArguments(
  operation: GoogleAdsOperationType,
  argumentsValue: unknown
): unknown {
  if (isStatusOperation(operation)) return ResourceNameArgumentsSchema.parse(argumentsValue)
  if (operation === 'add_negative_keywords') return NegativeKeywordArgumentsSchema.parse(argumentsValue)
  if (operation === 'create_budget') return CreateBudgetArgumentsSchema.parse(argumentsValue)
  if (operation === 'update_budget') return UpdateBudgetArgumentsSchema.parse(argumentsValue)
  if (operation === 'create_campaign') return CreateCampaignArgumentsSchema.parse(argumentsValue)
  if (operation === 'create_ad_group') return CreateAdGroupArgumentsSchema.parse(argumentsValue)
  if (operation === 'create_ad') return CreateResponsiveSearchAdArgumentsSchema.parse(argumentsValue)
  if (operation === 'add_keywords') return PositiveKeywordArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_locations') return SetLocationsArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_location_match_mode') return SetLocationMatchModeArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_languages') return SetLanguagesArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_ad_schedule') return SetAdScheduleArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_devices') return SetDevicesArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_demographics') return SetDemographicsArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_placements') return SetPlacementsArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_content_exclusions') return SetContentExclusionsArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_audience_associations') return SetAudienceAssociationsArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_campaign_conversion_goals') return SetCampaignConversionGoalsArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_customer_goal_biddability') return SetCustomerGoalBiddabilityArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_conversion_primary_state') return SetConversionPrimaryStateArgumentsSchema.parse(argumentsValue)
  if (operation === 'create_conversion_action') return CreateConversionActionArgumentsSchema.parse(argumentsValue)
  if (operation === 'update_conversion_action') return UpdateConversionActionArgumentsSchema.parse(argumentsValue)
  throw new Error(`Unsupported Search Google Ads operation: ${operation}`)
}

function buildStatusAction(context: BuildGoogleAdsActionContext, operation: StatusOperation): BuiltGoogleAdsAction {
  const config = STATUS_OPERATIONS[operation]
  if (context.input.resourceType !== config.resourceType) {
    throw new Error(`Operation ${operation} requires resource type ${config.resourceType}`)
  }
  const args = ResourceNameArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, config.segment)
  const status = 'status' in config ? config.status : args.status
  if (!status) throw new Error(`Operation ${operation} requires a target status`)

  return {
    resourceName: args.resourceName,
    desiredState: { resourceName: args.resourceName, status },
    providerOperations: [{
      service: config.service,
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{
        update: { resourceName: args.resourceName, status },
        updateMask: 'status'
      }]
    }]
  }
}

function buildNegativeKeywordAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'negative_keyword') {
    throw new Error('Negative keyword operations require resource type negative_keyword')
  }
  const args = NegativeKeywordArgumentsSchema.parse(context.input.arguments)
  const segment = args.scope === 'campaign' ? 'campaigns' : 'adGroups'
  assertResourceName(args.parentResourceName, context.customerId, segment)

  const existing = parseCurrentCriteria(context.currentState)
  const seen = new Set(existing.map(keywordKey))
  const additions: Array<{ text: string, matchType: 'EXACT' | 'PHRASE' | 'BROAD', negative: true }> = []
  for (const keyword of args.keywords) {
    const normalized = { text: normalizeKeywordText(keyword.text), matchType: keyword.matchType, negative: true as const }
    const key = keywordKey(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    additions.push(normalized)
  }
  if (additions.length === 0) throw new Error('No new negative keywords remain after deduplication')

  const parentField = args.scope === 'campaign' ? 'campaign' : 'adGroup'
  const desiredCriteria = [...existing, ...additions].sort((left, right) => (
    keywordKey(left).localeCompare(keywordKey(right))
  ))
  return {
    resourceName: args.parentResourceName,
    desiredState: { criteria: desiredCriteria },
    providerOperations: [{
      service: args.scope === 'campaign' ? 'campaignCriteria' : 'adGroupCriteria',
      atomicity: 'independent',
      partialFailure: additions.length > 1,
      operations: additions.map(keyword => ({
        create: {
          [parentField]: args.parentResourceName,
          negative: true,
          keyword: { text: keyword.text, matchType: keyword.matchType }
        }
      }))
    }]
  }
}

function amountMicros(value: number): string {
  const micros = Math.round(value * 1_000_000)
  if (!Number.isSafeInteger(micros) || micros <= 0) throw new Error('Google Ads amount is outside the safe range')
  return String(micros)
}

function createAction(
  service: 'campaignBudgets' | 'campaigns' | 'adGroups' | 'adGroupAds',
  desiredState: Record<string, unknown>,
  resourceName: string | null = null
): BuiltGoogleAdsAction {
  return {
    resourceName,
    desiredState,
    providerOperations: [{
      service,
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ create: desiredState }]
    }]
  }
}

function buildBudgetAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'budget') throw new Error('Budget operation requires resource type budget')
  if (context.input.operation === 'create_budget') {
    const args = CreateBudgetArgumentsSchema.parse(context.input.arguments)
    return createAction('campaignBudgets', {
      name: args.name,
      amountMicros: amountMicros(args.dailyAmount),
      deliveryMethod: 'STANDARD',
      explicitlyShared: false
    })
  }
  const args = UpdateBudgetArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, 'campaignBudgets')
  const desiredState = {
    ...(context.currentState && typeof context.currentState === 'object' ? context.currentState : {}),
    resourceName: args.resourceName,
    amountMicros: amountMicros(args.dailyAmount)
  }
  return {
    resourceName: args.resourceName,
    desiredState,
    providerOperations: [{
      service: 'campaignBudgets',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{
        update: { resourceName: args.resourceName, amountMicros: amountMicros(args.dailyAmount) },
        updateMask: 'amount_micros'
      }]
    }]
  }
}

function buildCreateCampaignAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'campaign') throw new Error('Campaign creation requires resource type campaign')
  const args = CreateCampaignArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.budgetResourceName, context.customerId, 'campaignBudgets')
  return createAction('campaigns', {
    name: args.name,
    status: 'PAUSED',
    advertisingChannelType: 'SEARCH',
    campaignBudget: args.budgetResourceName,
    manualCpc: {},
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: true,
      targetPartnerSearchNetwork: args.includeSearchPartners,
      targetContentNetwork: false
    },
    containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    ...(args.startDateTime ? { startDateTime: args.startDateTime } : {}),
    ...(args.endDateTime ? { endDateTime: args.endDateTime } : {})
  })
}

function buildCreateAdGroupAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'ad_group') throw new Error('Ad group creation requires resource type ad_group')
  const args = CreateAdGroupArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.campaignResourceName, context.customerId, 'campaigns')
  return createAction('adGroups', {
    name: args.name,
    campaign: args.campaignResourceName,
    type: 'SEARCH_STANDARD',
    status: 'PAUSED',
    ...(args.cpcBid === undefined ? {} : { cpcBidMicros: amountMicros(args.cpcBid) })
  })
}

function buildCreateResponsiveSearchAdAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'ad') throw new Error('Ad creation requires resource type ad')
  const args = CreateResponsiveSearchAdArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.adGroupResourceName, context.customerId, 'adGroups')
  const desiredState = {
    adGroup: args.adGroupResourceName,
    status: 'PAUSED',
    ad: {
      finalUrls: [args.finalUrl],
      responsiveSearchAd: {
        headlines: args.headlines.map(text => ({ text })),
        descriptions: args.descriptions.map(text => ({ text })),
        ...(args.path1 ? { path1: args.path1 } : {}),
        ...(args.path2 ? { path2: args.path2 } : {})
      }
    }
  }
  return createAction('adGroupAds', desiredState, args.adGroupResourceName)
}

function buildPositiveKeywordAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'keyword') throw new Error('Keyword creation requires resource type keyword')
  const args = PositiveKeywordArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.adGroupResourceName, context.customerId, 'adGroups')
  const existing = parseCurrentPositiveCriteria(context.currentState)
  const seen = new Set(existing.map(keywordKey))
  const additions = args.keywords.flatMap((keyword) => {
    const normalized = { text: normalizeKeywordText(keyword.text), matchType: keyword.matchType }
    const key = keywordKey(normalized)
    if (seen.has(key)) return []
    seen.add(key)
    return [normalized]
  })
  if (additions.length === 0) throw new Error('No new positive keywords remain after deduplication')
  const desiredCriteria = [
    ...existing,
    ...additions.map(keyword => ({
      ...keyword,
      negative: false as const,
      status: 'PAUSED' as const
    }))
  ].sort((left, right) => keywordKey(left).localeCompare(keywordKey(right)))
  return {
    resourceName: args.adGroupResourceName,
    desiredState: {
      adGroupResourceName: args.adGroupResourceName,
      criteria: desiredCriteria
    },
    providerOperations: [{
      service: 'adGroupCriteria',
      atomicity: 'independent',
      partialFailure: additions.length > 1,
      operations: additions.map(keyword => ({ create: {
        adGroup: args.adGroupResourceName,
        status: 'PAUSED',
        negative: false,
        keyword
      } }))
    }]
  }
}

function buildLocationAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'location') throw new Error('Location targeting requires resource type location')
  const args = SetLocationsArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.campaignResourceName, context.customerId, 'campaigns')
  const current = z.object({
    campaignResourceName: z.literal(args.campaignResourceName),
    locationIds: z.array(z.string().regex(/^\d{1,20}$/)),
    criteria: z.record(z.string().regex(/^\d{1,20}$/), z.string())
  }).parse(context.currentState)
  const desiredIds = [...new Set(args.geoTargetConstantIds)]
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
  const desiredSet = new Set(desiredIds)
  const currentSet = new Set(current.locationIds)
  const additions = desiredIds.filter(id => !currentSet.has(id))
  const removals = current.locationIds.filter(id => !desiredSet.has(id))
  if (additions.length === 0 && removals.length === 0) {
    throw new Error('Campaign location targeting already matches the requested set')
  }

  const campaignId = args.campaignResourceName.slice(args.campaignResourceName.lastIndexOf('/') + 1)
  const retainedCriteria: Record<string, string> = {}
  for (const id of desiredIds) {
    const resourceName = current.criteria[id]
    if (resourceName) retainedCriteria[id] = resourceName
  }
  const removeOperations = removals.map((id) => {
    const resourceName = current.criteria[id]
    if (!resourceName) throw new Error('Current campaign location criterion has no provider resource')
    assertResourceName(resourceName, context.customerId, 'campaignCriteria')
    if (!resourceName.includes(`/campaignCriteria/${campaignId}~`)) {
      throw new Error('Campaign location criterion does not belong to the selected campaign')
    }
    return { remove: resourceName } as const
  })
  return {
    resourceName: args.campaignResourceName,
    desiredState: {
      campaignResourceName: args.campaignResourceName,
      locationIds: desiredIds,
      criteria: retainedCriteria
    },
    providerOperations: [{
      service: 'campaignCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        ...additions.map(id => ({ create: {
          campaign: args.campaignResourceName,
          negative: false,
          location: { geoTargetConstant: `geoTargetConstants/${id}` }
        } })),
        ...removeOperations
      ]
    }]
  }
}

function buildLocationMatchModeAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'location') throw new Error('Location match mode requires resource type location')
  const args = SetLocationMatchModeArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.campaignResourceName, context.customerId, 'campaigns')
  const current = z.object({
    campaignResourceName: z.literal(args.campaignResourceName),
    positiveGeoTargetType: z.enum(['PRESENCE', 'PRESENCE_OR_INTEREST'])
  }).parse(context.currentState)
  if (current.positiveGeoTargetType === args.positiveGeoTargetType) {
    throw new Error('Campaign location match mode already matches the requested value')
  }
  const desiredState = {
    campaignResourceName: args.campaignResourceName,
    positiveGeoTargetType: args.positiveGeoTargetType
  }
  return {
    resourceName: args.campaignResourceName,
    desiredState,
    providerOperations: [{
      service: 'campaigns',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{
        update: {
          resourceName: args.campaignResourceName,
          geoTargetTypeSetting: { positiveGeoTargetType: args.positiveGeoTargetType }
        },
        updateMask: 'geo_target_type_setting.positive_geo_target_type'
      }]
    }]
  }
}

function buildLanguageAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'language') throw new Error('Language targeting requires resource type language')
  const args = SetLanguagesArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.campaignResourceName, context.customerId, 'campaigns')
  const current = z.object({
    campaignResourceName: z.literal(args.campaignResourceName),
    languageIds: z.array(z.string().regex(/^\d{1,20}$/)),
    criteria: z.record(z.string().regex(/^\d{1,20}$/), z.string())
  }).parse(context.currentState)
  const desiredIds = [...new Set(args.languageConstantIds)]
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
  const desiredSet = new Set(desiredIds)
  const currentSet = new Set(current.languageIds)
  const additions = desiredIds.filter(id => !currentSet.has(id))
  const removals = current.languageIds.filter(id => !desiredSet.has(id))
  if (additions.length === 0 && removals.length === 0) {
    throw new Error('Campaign language targeting already matches the requested set')
  }

  const campaignId = args.campaignResourceName.slice(args.campaignResourceName.lastIndexOf('/') + 1)
  const retainedCriteria: Record<string, string> = {}
  for (const id of desiredIds) {
    const resourceName = current.criteria[id]
    if (resourceName) retainedCriteria[id] = resourceName
  }
  const removeOperations = removals.map((id) => {
    const resourceName = current.criteria[id]
    if (!resourceName) throw new Error('Current campaign language criterion has no provider resource')
    assertResourceName(resourceName, context.customerId, 'campaignCriteria')
    if (!resourceName.includes(`/campaignCriteria/${campaignId}~`)) {
      throw new Error('Campaign language criterion does not belong to the selected campaign')
    }
    return { remove: resourceName } as const
  })
  return {
    resourceName: args.campaignResourceName,
    desiredState: {
      campaignResourceName: args.campaignResourceName,
      languageIds: desiredIds,
      criteria: retainedCriteria
    },
    providerOperations: [{
      service: 'campaignCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        ...additions.map(id => ({ create: {
          campaign: args.campaignResourceName,
          negative: false,
          language: { languageConstant: `languageConstants/${id}` }
        } })),
        ...removeOperations
      ]
    }]
  }
}

function buildAdScheduleAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'ad_schedule') throw new Error('Ad scheduling requires resource type ad_schedule')
  const args = SetAdScheduleArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.campaignResourceName, context.customerId, 'campaigns')
  const current = z.object({
    campaignResourceName: z.literal(args.campaignResourceName),
    schedules: z.array(AdScheduleSchema),
    criteria: z.record(z.string(), z.string())
  }).parse(context.currentState)
  const desiredSchedules = sortSchedules(args.schedules)
  const currentByKey = new Map(current.schedules.map(schedule => [scheduleKey(schedule), schedule]))
  const desiredByKey = new Map(desiredSchedules.map(schedule => [scheduleKey(schedule), schedule]))
  const additions = desiredSchedules.filter(schedule => !currentByKey.has(scheduleKey(schedule)))
  const removals = current.schedules.filter(schedule => !desiredByKey.has(scheduleKey(schedule)))
  if (additions.length === 0 && removals.length === 0) {
    throw new Error('Campaign ad schedule already matches the requested set')
  }

  const campaignId = args.campaignResourceName.slice(args.campaignResourceName.lastIndexOf('/') + 1)
  const retainedCriteria: Record<string, string> = {}
  for (const schedule of desiredSchedules) {
    const key = scheduleKey(schedule)
    const resourceName = current.criteria[key]
    if (resourceName) retainedCriteria[key] = resourceName
  }
  const removeOperations = removals.map((schedule) => {
    const resourceName = current.criteria[scheduleKey(schedule)]
    if (!resourceName) throw new Error('Current campaign ad schedule has no provider resource')
    assertResourceName(resourceName, context.customerId, 'campaignCriteria')
    if (!resourceName.includes(`/campaignCriteria/${campaignId}~`)) {
      throw new Error('Campaign ad schedule does not belong to the selected campaign')
    }
    return { remove: resourceName } as const
  })
  return {
    resourceName: args.campaignResourceName,
    desiredState: {
      campaignResourceName: args.campaignResourceName,
      schedules: desiredSchedules,
      criteria: retainedCriteria
    },
    providerOperations: [{
      service: 'campaignCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        ...additions.map(schedule => ({ create: {
          campaign: args.campaignResourceName,
          negative: false,
          adSchedule: {
            dayOfWeek: schedule.dayOfWeek,
            startHour: schedule.startHour,
            startMinute: MINUTE_ENUM[schedule.startMinute],
            endHour: schedule.endHour,
            endMinute: MINUTE_ENUM[schedule.endMinute]
          }
        } })),
        ...removeOperations
      ]
    }]
  }
}

function buildDeviceAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'device') throw new Error('Device targeting requires resource type device')
  const args = SetDevicesArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.campaignResourceName, context.customerId, 'campaigns')
  const current = z.object({
    campaignResourceName: z.literal(args.campaignResourceName),
    devices: z.array(z.object({
      resourceName: z.string(),
      type: DeviceTypeSchema,
      bidModifier: BidModifierSchema
    }))
  }).parse(context.currentState)
  const currentByType = new Map(current.devices.map(device => [device.type, device]))
  const requestedByType = new Map(args.devices.map(device => [device.type, device.bidModifier]))
  const operations: Array<{ update: { resourceName: string, bidModifier: number }, updateMask: string }> = []
  for (const requested of args.devices) {
    const existing = currentByType.get(requested.type)
    if (!existing) throw new Error(`Google Ads campaign has no ${requested.type} device criterion`)
    assertResourceName(existing.resourceName, context.customerId, 'campaignCriteria')
    const campaignId = args.campaignResourceName.slice(args.campaignResourceName.lastIndexOf('/') + 1)
    if (!existing.resourceName.includes(`/campaignCriteria/${campaignId}~`)) {
      throw new Error('Campaign device criterion does not belong to the selected campaign')
    }
    if (existing.bidModifier !== requested.bidModifier) {
      operations.push({
        update: { resourceName: existing.resourceName, bidModifier: requested.bidModifier },
        updateMask: 'bid_modifier'
      })
    }
  }
  if (operations.length === 0) throw new Error('Campaign device bid modifiers already match the requested values')

  const desiredDevices = current.devices
    .map(device => ({
      ...device,
      bidModifier: requestedByType.get(device.type) ?? device.bidModifier
    }))
    .sort((left, right) => left.type.localeCompare(right.type))
  return {
    resourceName: args.campaignResourceName,
    desiredState: { campaignResourceName: args.campaignResourceName, devices: desiredDevices },
    providerOperations: [{
      service: 'campaignCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations
    }]
  }
}

function buildDemographicAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'demographic') {
    throw new Error('Demographic targeting requires resource type demographic')
  }
  const args = SetDemographicsArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.adGroupResourceName, context.customerId, 'adGroups')
  const CurrentCriterion = z.object({
    resourceName: z.string(),
    dimension: z.enum(['AGE_RANGE', 'GENDER']),
    type: z.string(),
    excluded: z.boolean()
  })
  const current = z.object({
    adGroupResourceName: z.literal(args.adGroupResourceName),
    criteria: z.array(CurrentCriterion)
  }).parse(context.currentState)
  const baseKey = (criterion: { dimension: string, type: string }) => `${criterion.dimension}:${criterion.type}`
  const currentByKey = new Map(current.criteria.map(criterion => [baseKey(criterion), criterion]))
  const requestedByKey = new Map(args.criteria.map(criterion => [baseKey(criterion), criterion]))
  const additions = args.criteria.filter((criterion) => {
    const existing = currentByKey.get(baseKey(criterion))
    return !existing || existing.excluded !== criterion.excluded
  })
  const removals = current.criteria.filter((criterion) => {
    const requested = requestedByKey.get(baseKey(criterion))
    return !requested || requested.excluded !== criterion.excluded
  })
  if (additions.length === 0 && removals.length === 0) {
    throw new Error('Ad-group demographic criteria already match the requested set')
  }
  const adGroupId = args.adGroupResourceName.slice(args.adGroupResourceName.lastIndexOf('/') + 1)
  const removalOperations = removals.map((criterion) => {
    assertResourceName(criterion.resourceName, context.customerId, 'adGroupCriteria')
    if (!criterion.resourceName.includes(`/adGroupCriteria/${adGroupId}~`)) {
      throw new Error('Demographic criterion does not belong to the selected ad group')
    }
    return { remove: criterion.resourceName } as const
  })
  const desiredCriteria = args.criteria.map((criterion) => {
    const existing = currentByKey.get(baseKey(criterion))
    return existing?.excluded === criterion.excluded ? existing : criterion
  }).sort((left, right) => baseKey(left).localeCompare(baseKey(right)))
  return {
    resourceName: args.adGroupResourceName,
    desiredState: { adGroupResourceName: args.adGroupResourceName, criteria: desiredCriteria },
    providerOperations: [{
      service: 'adGroupCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        ...removalOperations,
        ...additions.map(criterion => ({ create: {
          adGroup: args.adGroupResourceName,
          negative: criterion.excluded,
          status: 'ENABLED',
          ...(criterion.dimension === 'AGE_RANGE'
            ? { ageRange: { type: criterion.type } }
            : { gender: { type: criterion.type } })
        } }))
      ]
    }]
  }
}

function buildPlacementAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'placement') throw new Error('Placement targeting requires resource type placement')
  const args = SetPlacementsArgumentsSchema.parse(context.input.arguments)
  const parentSegment = args.scope === 'campaign' ? 'campaigns' : 'adGroups'
  const criterionSegment = args.scope === 'campaign' ? 'campaignCriteria' : 'adGroupCriteria'
  const service = args.scope === 'campaign' ? 'campaignCriteria' : 'adGroupCriteria'
  const parentField = args.scope === 'campaign' ? 'campaign' : 'adGroup'
  assertResourceName(args.parentResourceName, context.customerId, parentSegment)
  const current = z.object({
    scope: z.literal(args.scope),
    parentResourceName: z.literal(args.parentResourceName),
    placements: z.array(z.object({ resourceName: z.string(), url: PlacementUrlSchema }))
  }).parse(context.currentState)
  const desiredUrls = [...args.urls].sort((left, right) => left.localeCompare(right))
  const desiredSet = new Set(desiredUrls)
  const currentByUrl = new Map(current.placements.map(placement => [placement.url, placement]))
  const additions = desiredUrls.filter(url => !currentByUrl.has(url))
  const removals = current.placements.filter(placement => !desiredSet.has(placement.url))
  if (additions.length === 0 && removals.length === 0) {
    throw new Error('Placement exclusions already match the requested set')
  }
  const parentId = args.parentResourceName.slice(args.parentResourceName.lastIndexOf('/') + 1)
  const removalOperations = removals.map((placement) => {
    assertResourceName(placement.resourceName, context.customerId, criterionSegment)
    if (!placement.resourceName.includes(`/${criterionSegment}/${parentId}~`)) {
      throw new Error('Placement criterion does not belong to the selected parent')
    }
    return { remove: placement.resourceName } as const
  })
  const desiredPlacements = desiredUrls.map(url => currentByUrl.get(url) ?? { url })
  return {
    resourceName: args.parentResourceName,
    desiredState: { scope: args.scope, parentResourceName: args.parentResourceName, placements: desiredPlacements },
    providerOperations: [{
      service,
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        ...additions.map(url => ({ create: {
          [parentField]: args.parentResourceName,
          negative: true,
          ...(args.scope === 'ad_group' ? { status: 'ENABLED' } : {}),
          placement: { url }
        } })),
        ...removalOperations
      ]
    }]
  }
}

function buildContentExclusionAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'content_exclusion') {
    throw new Error('Content exclusions require resource type content_exclusion')
  }
  const args = SetContentExclusionsArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.campaignResourceName, context.customerId, 'campaigns')
  const current = z.object({
    campaignResourceName: z.literal(args.campaignResourceName),
    labels: z.array(z.object({ resourceName: z.string(), type: ContentLabelTypeSchema }))
  }).parse(context.currentState)
  const desiredTypes = [...args.labels].sort((left, right) => left.localeCompare(right))
  const desiredSet = new Set(desiredTypes)
  const currentByType = new Map(current.labels.map(label => [label.type, label]))
  const additions = desiredTypes.filter(type => !currentByType.has(type))
  const removals = current.labels.filter(label => !desiredSet.has(label.type))
  if (additions.length === 0 && removals.length === 0) {
    throw new Error('Campaign content exclusions already match the requested set')
  }
  const campaignId = args.campaignResourceName.slice(args.campaignResourceName.lastIndexOf('/') + 1)
  const removalOperations = removals.map((label) => {
    assertResourceName(label.resourceName, context.customerId, 'campaignCriteria')
    if (!label.resourceName.includes(`/campaignCriteria/${campaignId}~`)) {
      throw new Error('Content-label criterion does not belong to the selected campaign')
    }
    return { remove: label.resourceName } as const
  })
  return {
    resourceName: args.campaignResourceName,
    desiredState: {
      campaignResourceName: args.campaignResourceName,
      labels: desiredTypes.map(type => currentByType.get(type) ?? { type })
    },
    providerOperations: [{
      service: 'campaignCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        ...additions.map(type => ({ create: {
          campaign: args.campaignResourceName,
          negative: true,
          contentLabel: { type }
        } })),
        ...removalOperations
      ]
    }]
  }
}

function buildAudienceAssociationAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'audience') throw new Error('Audience associations require resource type audience')
  const args = SetAudienceAssociationsArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.adGroupResourceName, context.customerId, 'adGroups')
  for (const resourceName of args.audienceResourceNames) {
    assertResourceName(resourceName, context.customerId, 'audiences')
  }
  const Restriction = z.object({
    targetingDimension: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    bidOnly: z.boolean()
  })
  const current = z.object({
    adGroupResourceName: z.literal(args.adGroupResourceName),
    audienceGrouped: z.literal(true),
    targetRestrictions: z.array(Restriction),
    associations: z.array(z.object({ resourceName: z.string(), audienceResourceName: z.string() }))
  }).parse(context.currentState)
  const desiredAudienceNames = [...args.audienceResourceNames].sort((left, right) => left.localeCompare(right))
  const desiredAudienceSet = new Set(desiredAudienceNames)
  const currentByAudience = new Map(current.associations.map(item => [item.audienceResourceName, item]))
  const additions = desiredAudienceNames.filter(resourceName => !currentByAudience.has(resourceName))
  const removals = current.associations.filter(item => !desiredAudienceSet.has(item.audienceResourceName))
  const desiredBidOnly = args.mode === 'OBSERVATION'
  const existingAudienceRestriction = current.targetRestrictions.find(item => item.targetingDimension === 'AUDIENCE')
  const desiredRestrictions = [
    ...current.targetRestrictions.filter(item => item.targetingDimension !== 'AUDIENCE'),
    { targetingDimension: 'AUDIENCE', bidOnly: desiredBidOnly }
  ]
  const providerOperations: BuiltGoogleAdsAction['providerOperations'] = []
  if (!existingAudienceRestriction || existingAudienceRestriction.bidOnly !== desiredBidOnly) {
    providerOperations.push({
      service: 'adGroups', atomicity: 'interdependent', partialFailure: false,
      operations: [{
        update: {
          resourceName: args.adGroupResourceName,
          targetingSetting: { targetRestrictions: desiredRestrictions }
        },
        updateMask: 'targeting_setting.target_restrictions'
      }]
    })
  }
  if (additions.length > 0 || removals.length > 0) {
    const adGroupId = args.adGroupResourceName.slice(args.adGroupResourceName.lastIndexOf('/') + 1)
    const removalOperations = removals.map((association) => {
      assertResourceName(association.resourceName, context.customerId, 'adGroupCriteria')
      if (!association.resourceName.includes(`/adGroupCriteria/${adGroupId}~`)) {
        throw new Error('Audience criterion does not belong to the selected ad group')
      }
      return { remove: association.resourceName } as const
    })
    providerOperations.push({
      service: 'adGroupCriteria', atomicity: 'interdependent', partialFailure: false,
      operations: [
        ...additions.map(audience => ({ create: {
          adGroup: args.adGroupResourceName,
          negative: false,
          status: 'ENABLED',
          audience: { audience }
        } })),
        ...removalOperations
      ]
    })
  }
  if (providerOperations.length === 0) throw new Error('Audience associations already match the requested mode and set')
  return {
    resourceName: args.adGroupResourceName,
    desiredState: {
      adGroupResourceName: args.adGroupResourceName,
      audienceGrouped: true,
      targetRestrictions: desiredRestrictions,
      associations: desiredAudienceNames.map(audienceResourceName => (
        currentByAudience.get(audienceResourceName) ?? { audienceResourceName }
      ))
    },
    providerOperations
  }
}

function buildCampaignConversionGoalAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'conversion_goal') throw new Error('Campaign goals require resource type conversion_goal')
  const args = SetCampaignConversionGoalsArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.campaignResourceName, context.customerId, 'campaigns')
  const GoalSchema = z.object({
    resourceName: z.string().optional(),
    category: ConversionCategorySchema,
    origin: ConversionOriginSchema,
    biddable: z.boolean()
  })
  const current = z.object({
    campaignResourceName: z.literal(args.campaignResourceName),
    goals: z.array(GoalSchema)
  }).parse(context.currentState)
  const key = (goal: { category: string, origin: string }) => `${goal.category}:${goal.origin}`
  const requested = new Map(args.goals.map(goal => [key(goal), goal]))
  const currentByKey = new Map(current.goals.map(goal => [key(goal), goal]))
  const operations: Array<
    | { update: Record<string, unknown>, updateMask: string }
    | { create: Record<string, unknown> }
  > = []
  for (const goal of args.goals) {
    const existing = currentByKey.get(key(goal))
    if (existing?.resourceName) {
      const campaignId = args.campaignResourceName.slice(args.campaignResourceName.lastIndexOf('/') + 1)
      const expected = `customers/${context.customerId}/campaignConversionGoals/${campaignId}~${goal.category}~${goal.origin}`
      if (existing.resourceName !== expected) throw new Error('Campaign conversion goal does not belong to the selected campaign')
      if (existing.biddable !== goal.biddable) {
        operations.push({ update: { resourceName: existing.resourceName, biddable: goal.biddable }, updateMask: 'biddable' })
      }
    } else {
      operations.push({ create: {
        campaign: args.campaignResourceName,
        category: goal.category,
        origin: goal.origin,
        biddable: goal.biddable
      } })
    }
  }
  if (operations.length === 0) throw new Error('Campaign conversion goals already match the requested values')
  const desiredGoals = [
    ...current.goals.map(goal => requested.has(key(goal)) ? { ...goal, biddable: requested.get(key(goal))!.biddable } : goal),
    ...args.goals.filter(goal => !currentByKey.has(key(goal)))
  ].sort((left, right) => key(left).localeCompare(key(right)))
  return {
    resourceName: args.campaignResourceName,
    desiredState: { campaignResourceName: args.campaignResourceName, goals: desiredGoals },
    providerOperations: [{ service: 'campaignConversionGoals', atomicity: 'interdependent', partialFailure: false, operations }]
  }
}

function buildCustomerGoalBiddabilityAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'conversion_goal') {
    throw new Error('Customer goals require resource type conversion_goal')
  }
  const args = SetCustomerGoalBiddabilityArgumentsSchema.parse(context.input.arguments)
  const resourceName = `customers/${context.customerId}/customerConversionGoals/${args.category}~${args.origin}`
  const current = z.object({
    resourceName: z.literal(resourceName),
    category: z.literal(args.category),
    origin: z.literal(args.origin),
    biddable: z.boolean()
  }).parse(context.currentState)
  if (current.biddable === args.biddable) {
    throw new Error('Customer conversion goal already matches the requested biddability')
  }
  return {
    resourceName,
    desiredState: { ...current, biddable: args.biddable },
    providerOperations: [{
      service: 'customerConversionGoals',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ update: { resourceName, biddable: args.biddable }, updateMask: 'biddable' }]
    }]
  }
}

function buildConversionPrimaryStateAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'conversion_action') {
    throw new Error('Conversion primary state requires resource type conversion_action')
  }
  const args = SetConversionPrimaryStateArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, 'conversionActions')
  const current = MutableConversionActionStateSchema.parse(context.currentState)
  if (current.resourceName !== args.resourceName) throw new Error('Conversion action state does not match the selected resource')
  if (current.primaryForGoal === args.primaryForGoal) {
    throw new Error('Conversion action primary state already matches the requested value')
  }
  return {
    resourceName: args.resourceName,
    desiredState: { resourceName: args.resourceName, primaryForGoal: args.primaryForGoal },
    providerOperations: [{
      service: 'conversionActions',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{
        update: { resourceName: args.resourceName, primaryForGoal: args.primaryForGoal },
        updateMask: 'primary_for_goal'
      }]
    }]
  }
}

function buildCreateConversionAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'conversion_action') {
    throw new Error('Conversion action creation requires resource type conversion_action')
  }
  const args = CreateConversionActionArgumentsSchema.parse(context.input.arguments)
  const current = z.object({ exists: z.literal(false) }).parse(context.currentState)
  void current
  const viewThroughLookbackWindowDays = args.viewThroughLookbackWindowDays
    ?? (args.type === 'WEBPAGE' ? 1 : undefined)
  const desiredState = {
    name: args.name,
    type: args.type,
    category: args.category,
    status: 'ENABLED',
    countingType: args.countingType,
    clickThroughLookbackWindowDays: String(args.clickThroughLookbackWindowDays),
    ...(viewThroughLookbackWindowDays === undefined
      ? {}
      : { viewThroughLookbackWindowDays: String(viewThroughLookbackWindowDays) })
  }
  return {
    resourceName: null,
    desiredState,
    providerOperations: [{
      service: 'conversionActions',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ create: desiredState }]
    }]
  }
}

function buildUpdateConversionAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'conversion_action') {
    throw new Error('Conversion action update requires resource type conversion_action')
  }
  const args = UpdateConversionActionArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, 'conversionActions')
  const current = MutableConversionActionStateSchema.parse(context.currentState)
  if (current.resourceName !== args.resourceName) throw new Error('Conversion action state does not match the selected resource')
  if (args.viewThroughLookbackWindowDays !== undefined && current.type !== 'WEBPAGE') {
    throw new Error('View-through windows are supported only for WEBPAGE conversion actions')
  }
  const update: Record<string, unknown> = { resourceName: args.resourceName }
  const desiredState: Record<string, unknown> = { resourceName: args.resourceName }
  const masks: string[] = []
  const add = (field: string, mask: string, value: unknown, currentValue: unknown) => {
    if (value === undefined || value === currentValue) return
    update[field] = value
    desiredState[field] = value
    masks.push(mask)
  }
  add('name', 'name', args.name, current.name)
  add('category', 'category', args.category, current.category)
  add('status', 'status', args.status, current.status)
  add('countingType', 'counting_type', args.countingType, current.countingType)
  add('clickThroughLookbackWindowDays', 'click_through_lookback_window_days',
    args.clickThroughLookbackWindowDays === undefined ? undefined : String(args.clickThroughLookbackWindowDays),
    current.clickThroughLookbackWindowDays)
  add('viewThroughLookbackWindowDays', 'view_through_lookback_window_days',
    args.viewThroughLookbackWindowDays === undefined ? undefined : String(args.viewThroughLookbackWindowDays),
    current.viewThroughLookbackWindowDays)
  if (masks.length === 0) throw new Error('Conversion action already matches the requested values')
  return {
    resourceName: args.resourceName,
    desiredState,
    providerOperations: [{
      service: 'conversionActions',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ update, updateMask: masks.join(',') }]
    }]
  }
}

export function buildSearchGoogleAdsAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (isStatusOperation(context.input.operation)) {
    return buildStatusAction(context, context.input.operation)
  }
  if (context.input.operation === 'add_negative_keywords') {
    return buildNegativeKeywordAction(context)
  }
  if (context.input.operation === 'create_budget' || context.input.operation === 'update_budget') {
    return buildBudgetAction(context)
  }
  if (context.input.operation === 'create_campaign') return buildCreateCampaignAction(context)
  if (context.input.operation === 'create_ad_group') return buildCreateAdGroupAction(context)
  if (context.input.operation === 'create_ad') return buildCreateResponsiveSearchAdAction(context)
  if (context.input.operation === 'add_keywords') return buildPositiveKeywordAction(context)
  if (context.input.operation === 'set_locations') return buildLocationAction(context)
  if (context.input.operation === 'set_location_match_mode') return buildLocationMatchModeAction(context)
  if (context.input.operation === 'set_languages') return buildLanguageAction(context)
  if (context.input.operation === 'set_ad_schedule') return buildAdScheduleAction(context)
  if (context.input.operation === 'set_devices') return buildDeviceAction(context)
  if (context.input.operation === 'set_demographics') return buildDemographicAction(context)
  if (context.input.operation === 'set_placements') return buildPlacementAction(context)
  if (context.input.operation === 'set_content_exclusions') return buildContentExclusionAction(context)
  if (context.input.operation === 'set_audience_associations') return buildAudienceAssociationAction(context)
  if (context.input.operation === 'set_campaign_conversion_goals') return buildCampaignConversionGoalAction(context)
  if (context.input.operation === 'set_customer_goal_biddability') return buildCustomerGoalBiddabilityAction(context)
  if (context.input.operation === 'set_conversion_primary_state') return buildConversionPrimaryStateAction(context)
  if (context.input.operation === 'create_conversion_action') return buildCreateConversionAction(context)
  if (context.input.operation === 'update_conversion_action') return buildUpdateConversionAction(context)
  throw new Error(`Unsupported Search Google Ads operation: ${context.input.operation}`)
}
