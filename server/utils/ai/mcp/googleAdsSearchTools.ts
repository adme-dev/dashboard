import { z } from 'zod'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { McpToolManifest } from '~~/server/utils/ai/mcp/project'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { PlanGoogleAdsActionInput } from '~~/server/utils/googleAds/actionPlanner'
import {
  planSearchGoogleAdsControlAction,
  type GoogleAdsControlFlags
} from '~~/server/utils/googleAds/searchRuntime'

export const GOOGLE_ADS_PLAN_PAUSE_TOOL = 'google_ads_plan_pause'
export const GOOGLE_ADS_PLAN_ARCHIVE_TOOL = 'google_ads_plan_archive'
export const GOOGLE_ADS_PLAN_ENABLE_TOOL = 'google_ads_plan_enable'
export const GOOGLE_ADS_PLAN_NEGATIVE_KEYWORDS_TOOL = 'google_ads_plan_add_negative_keywords'
export const GOOGLE_ADS_PLAN_CREATE_BUDGET_TOOL = 'google_ads_plan_create_budget'
export const GOOGLE_ADS_PLAN_UPDATE_BUDGET_TOOL = 'google_ads_plan_update_budget'
export const GOOGLE_ADS_PLAN_CREATE_SEARCH_CAMPAIGN_TOOL = 'google_ads_plan_create_search_campaign'
export const GOOGLE_ADS_PLAN_CREATE_AD_GROUP_TOOL = 'google_ads_plan_create_ad_group'
export const GOOGLE_ADS_PLAN_CREATE_RSA_TOOL = 'google_ads_plan_create_responsive_search_ad'
export const GOOGLE_ADS_PLAN_ADD_KEYWORDS_TOOL = 'google_ads_plan_add_keywords'
export const GOOGLE_ADS_PLAN_SET_LOCATIONS_TOOL = 'google_ads_plan_set_locations'
export const GOOGLE_ADS_PLAN_SET_LOCATION_MATCH_MODE_TOOL = 'google_ads_plan_set_location_match_mode'
export const GOOGLE_ADS_PLAN_SET_LANGUAGES_TOOL = 'google_ads_plan_set_languages'
export const GOOGLE_ADS_PLAN_SET_AD_SCHEDULE_TOOL = 'google_ads_plan_set_ad_schedule'
export const GOOGLE_ADS_PLAN_SET_DEVICES_TOOL = 'google_ads_plan_set_devices'
export const GOOGLE_ADS_PLAN_SET_DEMOGRAPHICS_TOOL = 'google_ads_plan_set_demographics'
export const GOOGLE_ADS_PLAN_SET_PLACEMENTS_TOOL = 'google_ads_plan_set_placements'
export const GOOGLE_ADS_PLAN_SET_CAMPAIGN_CONVERSION_GOALS_TOOL = 'google_ads_plan_set_campaign_conversion_goals'
export const GOOGLE_ADS_PLAN_SET_CUSTOMER_GOAL_BIDDABILITY_TOOL = 'google_ads_plan_set_customer_goal_biddability'
export const GOOGLE_ADS_PLAN_SET_CONVERSION_PRIMARY_STATE_TOOL = 'google_ads_plan_set_conversion_primary_state'
export const GOOGLE_ADS_PLAN_CREATE_CONVERSION_ACTION_TOOL = 'google_ads_plan_create_conversion_action'
export const GOOGLE_ADS_PLAN_UPDATE_CONVERSION_ACTION_TOOL = 'google_ads_plan_update_conversion_action'

const CommonSchema = {
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(255)
}
const EntityTypeSchema = z.enum(['campaign', 'ad_group', 'ad', 'keyword'])
const PausableEntitySchema = z.strictObject({
  ...CommonSchema,
  entityType: EntityTypeSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  requestedMode: z.enum(['proposal', 'automatic']).default('proposal')
})
const ArchivableEntitySchema = z.strictObject({
  ...CommonSchema,
  entityType: z.enum(['campaign', 'ad_group', 'ad']),
  resourceName: z.string().trim().min(1).max(1_000)
})
const EnableEntitySchema = z.strictObject({
  ...CommonSchema,
  entityType: EntityTypeSchema,
  resourceName: z.string().trim().min(1).max(1_000)
})
const NegativeKeywordsSchema = z.strictObject({
  ...CommonSchema,
  scope: z.enum(['campaign', 'ad_group']),
  parentResourceName: z.string().trim().min(1).max(1_000),
  keywords: z.array(z.strictObject({
    text: z.string().trim().min(1).max(80),
    matchType: z.enum(['EXACT', 'PHRASE', 'BROAD'])
  })).min(1).max(100),
  requestedMode: z.enum(['proposal', 'automatic']).default('proposal')
})
const KeywordSchema = z.strictObject({
  text: z.string().trim().min(1).max(80),
  matchType: z.enum(['EXACT', 'PHRASE', 'BROAD'])
})
const CreateBudgetSchema = z.strictObject({
  ...CommonSchema,
  name: z.string().trim().min(1).max(255),
  dailyAmount: z.number().finite().positive().max(1_000_000)
})
const UpdateBudgetSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  dailyAmount: z.number().finite().positive().max(1_000_000)
})
const CampaignDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
const CreateSearchCampaignSchema = z.strictObject({
  ...CommonSchema,
  name: z.string().trim().min(1).max(255),
  budgetResourceName: z.string().trim().min(1).max(1_000),
  includeSearchPartners: z.boolean().default(false),
  startDateTime: CampaignDateTimeSchema.optional(),
  endDateTime: CampaignDateTimeSchema.optional()
})
const CreateAdGroupSchema = z.strictObject({
  ...CommonSchema,
  name: z.string().trim().min(1).max(255),
  campaignResourceName: z.string().trim().min(1).max(1_000),
  cpcBid: z.number().finite().positive().max(1_000_000).optional()
})
const CreateResponsiveSearchAdSchema = z.strictObject({
  ...CommonSchema,
  adGroupResourceName: z.string().trim().min(1).max(1_000),
  finalUrl: z.string().url().refine(value => value.startsWith('https://')),
  headlines: z.array(z.string().trim().min(1).max(30)).min(3).max(15),
  descriptions: z.array(z.string().trim().min(1).max(90)).min(2).max(4),
  path1: z.string().trim().min(1).max(15).optional(),
  path2: z.string().trim().min(1).max(15).optional()
}).superRefine((value, refinement) => {
  if (new Set(value.headlines.map(text => text.toLocaleLowerCase('en-AU'))).size !== value.headlines.length) {
    refinement.addIssue({ code: 'custom', message: 'Responsive search ad headlines must be unique' })
  }
  if (new Set(value.descriptions.map(text => text.toLocaleLowerCase('en-AU'))).size !== value.descriptions.length) {
    refinement.addIssue({ code: 'custom', message: 'Responsive search ad descriptions must be unique' })
  }
})
const AddKeywordsSchema = z.strictObject({
  ...CommonSchema,
  adGroupResourceName: z.string().trim().min(1).max(1_000),
  keywords: z.array(KeywordSchema).min(1).max(100)
})
const SetLocationsSchema = z.strictObject({
  ...CommonSchema,
  campaignResourceName: z.string().trim().min(1).max(1_000),
  geoTargetConstantIds: z.array(z.string().regex(/^\d{1,20}$/)).min(1).max(1_000)
})
const SetLocationMatchModeSchema = z.strictObject({
  ...CommonSchema,
  campaignResourceName: z.string().trim().min(1).max(1_000),
  positiveGeoTargetType: z.enum(['PRESENCE', 'PRESENCE_OR_INTEREST'])
})
const SetLanguagesSchema = z.strictObject({
  ...CommonSchema,
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
const SetAdScheduleSchema = z.strictObject({
  ...CommonSchema,
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
const DeviceTypeSchema = z.enum(['MOBILE', 'DESKTOP', 'TABLET', 'CONNECTED_TV', 'OTHER'])
const BidModifierSchema = z.number().finite().refine(
  value => value === 0 || (value >= 0.1 && value <= 10),
  { message: 'Device bid modifier must be 0 or between 0.1 and 10' }
)
const SetDevicesSchema = z.strictObject({
  ...CommonSchema,
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
const SetDemographicsSchema = z.strictObject({
  ...CommonSchema,
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
const SetPlacementsSchema = z.strictObject({
  ...CommonSchema,
  scope: z.enum(['campaign', 'ad_group']),
  parentResourceName: z.string().trim().min(1).max(1_000),
  urls: z.array(PlacementUrlSchema).max(1_000)
}).superRefine((value, refinement) => {
  if (new Set(value.urls).size !== value.urls.length) {
    refinement.addIssue({ code: 'custom', message: 'Placement URLs must be unique' })
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
const SetCampaignConversionGoalsSchema = z.strictObject({
  ...CommonSchema,
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
const SetCustomerGoalBiddabilitySchema = z.strictObject({
  ...CommonSchema,
  category: ConversionCategorySchema,
  origin: ConversionOriginSchema,
  biddable: z.boolean()
})
const SetConversionPrimaryStateSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  primaryForGoal: z.boolean()
})
const CreateConversionActionSchema = z.strictObject({
  ...CommonSchema,
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
const UpdateConversionActionSchema = z.strictObject({
  ...CommonSchema,
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

function manifest(name: string, description: string, schema: z.ZodType): McpToolManifest {
  return {
    name,
    description,
    inputSchema: z.toJSONSchema(schema) as Record<string, unknown>
  }
}

export const googleAdsSearchPlanningTools: McpToolManifest[] = [
  manifest(
    GOOGLE_ADS_PLAN_PAUSE_TOOL,
    'Plan a governed pause for one campaign, ad group, ad, or keyword. Automatic mode works only under an active matching account policy.',
    PausableEntitySchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_ARCHIVE_TOOL,
    'Plan a reversible archive for a campaign, ad group, or ad. Archive uses PAUSED and never permanently removes the Google Ads resource.',
    ArchivableEntitySchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_ENABLE_TOOL,
    'Plan enabling one campaign, ad group, ad, or keyword. Activation is a higher-risk approval action.',
    EnableEntitySchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_NEGATIVE_KEYWORDS_TOOL,
    'Plan typed campaign or ad-group negative keywords. Terms are normalized and deduplicated; automatic mode requires a bounded account policy.',
    NegativeKeywordsSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_CREATE_BUDGET_TOOL,
    'Plan a standard Google Ads campaign budget from a daily currency amount. Money changes require elevated approval.',
    CreateBudgetSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_UPDATE_BUDGET_TOOL,
    'Plan a daily amount update for one existing Google Ads campaign budget. Money changes require elevated approval.',
    UpdateBudgetSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_CREATE_SEARCH_CAMPAIGN_TOOL,
    'Plan a Search campaign attached to an existing budget. New campaigns are always created paused with Display expansion disabled.',
    CreateSearchCampaignSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_CREATE_AD_GROUP_TOOL,
    'Plan a standard Search ad group under an existing campaign. New ad groups are always created paused.',
    CreateAdGroupSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_CREATE_RSA_TOOL,
    'Plan a responsive search ad with typed headlines, descriptions, paths, and an HTTPS final URL. New ads are always created paused.',
    CreateResponsiveSearchAdSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_ADD_KEYWORDS_TOOL,
    'Plan typed positive keywords for an existing ad group. Existing terms are deduplicated and new keywords are always created paused.',
    AddKeywordsSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_LOCATIONS_TOOL,
    'Plan an atomic replacement of positive campaign locations using Google geo-target constant IDs. The campaign is never cleared before replacements validate.',
    SetLocationsSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_LOCATION_MATCH_MODE_TOOL,
    'Plan the positive campaign geo-target mode. Use PRESENCE for presence-only targeting or PRESENCE_OR_INTEREST for Google\'s broader default.',
    SetLocationMatchModeSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_LANGUAGES_TOOL,
    'Plan an atomic replacement of campaign languages using Google language constant IDs.',
    SetLanguagesSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_AD_SCHEDULE_TOOL,
    'Plan an atomic campaign ad schedule replacement using non-overlapping quarter-hour windows.',
    SetAdScheduleSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_DEVICES_TOOL,
    'Plan device bid modifiers for existing campaign device criteria. Use 0 to opt out or 0.1 through 10 for bid adjustment.',
    SetDevicesSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_DEMOGRAPHICS_TOOL,
    'Plan an atomic replacement of explicit ad-group age-range and gender targeting or exclusions.',
    SetDemographicsSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_PLACEMENTS_TOOL,
    'Plan an atomic replacement of campaign or ad-group placement URL exclusions. Google Ads v25 does not support positive Placement criteria.',
    SetPlacementsSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_CAMPAIGN_CONVERSION_GOALS_TOOL,
    'Plan campaign conversion-goal biddability by typed conversion category and origin. Explicit false values prevent campaign bidding on that goal.',
    SetCampaignConversionGoalsSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_CUSTOMER_GOAL_BIDDABILITY_TOOL,
    'Plan account-default conversion-goal biddability by typed category and origin. Google owns goal creation; this tool changes only biddability.',
    SetCustomerGoalBiddabilitySchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_CONVERSION_PRIMARY_STATE_TOOL,
    'Plan whether one conversion action is primary or secondary for bidding. False makes it secondary and non-biddable outside custom goals.',
    SetConversionPrimaryStateSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_CREATE_CONVERSION_ACTION_TOOL,
    'Plan a typed Google Ads conversion action. Google creates actions primary by default; use the primary-state tool after creation to make one secondary.',
    CreateConversionActionSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_UPDATE_CONVERSION_ACTION_TOOL,
    'Plan an update to mutable conversion-action fields. Type is immutable and removal is intentionally not exposed by this tool.',
    UpdateConversionActionSchema
  )
]

const TOOL_NAMES = new Set(googleAdsSearchPlanningTools.map(tool => tool.name))

export function isGoogleAdsSearchPlanningTool(name: string): boolean {
  return TOOL_NAMES.has(name)
}

const ENTITY_RESOURCE_TYPES = {
  campaign: 'campaign',
  ad_group: 'ad_group',
  ad: 'ad',
  keyword: 'keyword'
} as const

const PAUSE_OPERATIONS = {
  campaign: 'pause_campaign',
  ad_group: 'pause_ad_group',
  ad: 'pause_ad',
  keyword: 'pause_keyword'
} as const

const ARCHIVE_OPERATIONS = {
  campaign: 'archive_campaign',
  ad_group: 'archive_ad_group',
  ad: 'archive_ad'
} as const

const ENABLE_OPERATIONS = {
  campaign: 'enable_campaign',
  ad_group: 'enable_ad_group',
  ad: 'enable_ad',
  keyword: 'enable_keyword'
} as const

export interface GoogleAdsSearchPlanningToolDependencies {
  plan: typeof planSearchGoogleAdsControlAction
}

const defaultDependencies: GoogleAdsSearchPlanningToolDependencies = {
  plan: planSearchGoogleAdsControlAction
}

export type GoogleAdsSearchPlanningOutcome
  = | { ok: true, data: Record<string, unknown> }
    | { ok: false, error: string, code: 'not_found' | 'disabled' | 'forbidden' | 'bad_args' | 'blocked' | 'handler_error' }

export async function executeGoogleAdsSearchPlanningTool(
  name: string,
  rawArgs: unknown,
  context: ToolContext,
  flags: GoogleAdsControlFlags,
  hasWriteScope: boolean,
  overrides: Partial<GoogleAdsSearchPlanningToolDependencies> = {}
): Promise<GoogleAdsSearchPlanningOutcome> {
  if (!isGoogleAdsSearchPlanningTool(name)) {
    return { ok: false, error: `Unknown Google Ads Search tool: ${name}`, code: 'not_found' }
  }
  if (!flags.write) {
    return { ok: false, error: 'Google Ads write tools are not enabled over MCP.', code: 'disabled' }
  }
  if (!hasWriteScope || !roleHasPermission(context.userRole, 'MEDIA_BUYING')) {
    return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  }
  const dependencies = { ...defaultDependencies, ...overrides }

  try {
    let plannerInput: PlanGoogleAdsActionInput
    if (name === GOOGLE_ADS_PLAN_PAUSE_TOOL) {
      const args = PausableEntitySchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        requestedMode: args.requestedMode,
        actorId: context.userId,
        source: 'mcp' as const,
        operation: PAUSE_OPERATIONS[args.entityType],
        resourceType: ENTITY_RESOURCE_TYPES[args.entityType],
        arguments: { resourceName: args.resourceName }
      }
    } else if (name === GOOGLE_ADS_PLAN_ARCHIVE_TOOL) {
      const args = ArchivableEntitySchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp' as const,
        requestedMode: 'proposal' as const,
        operation: ARCHIVE_OPERATIONS[args.entityType],
        resourceType: ENTITY_RESOURCE_TYPES[args.entityType],
        arguments: { resourceName: args.resourceName }
      }
    } else if (name === GOOGLE_ADS_PLAN_ENABLE_TOOL) {
      const args = EnableEntitySchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp' as const,
        requestedMode: 'proposal' as const,
        operation: ENABLE_OPERATIONS[args.entityType],
        resourceType: ENTITY_RESOURCE_TYPES[args.entityType],
        arguments: { resourceName: args.resourceName }
      }
    } else if (name === GOOGLE_ADS_PLAN_NEGATIVE_KEYWORDS_TOOL) {
      const args = NegativeKeywordsSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        requestedMode: args.requestedMode,
        actorId: context.userId,
        source: 'mcp' as const,
        operation: 'add_negative_keywords' as const,
        resourceType: 'negative_keyword' as const,
        arguments: {
          scope: args.scope,
          parentResourceName: args.parentResourceName,
          keywords: args.keywords
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_CREATE_BUDGET_TOOL) {
      const args = CreateBudgetSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'create_budget',
        resourceType: 'budget',
        arguments: { name: args.name, dailyAmount: args.dailyAmount }
      }
    } else if (name === GOOGLE_ADS_PLAN_UPDATE_BUDGET_TOOL) {
      const args = UpdateBudgetSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'update_budget',
        resourceType: 'budget',
        arguments: { resourceName: args.resourceName, dailyAmount: args.dailyAmount }
      }
    } else if (name === GOOGLE_ADS_PLAN_CREATE_SEARCH_CAMPAIGN_TOOL) {
      const args = CreateSearchCampaignSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'create_campaign',
        resourceType: 'campaign',
        arguments: {
          name: args.name,
          budgetResourceName: args.budgetResourceName,
          includeSearchPartners: args.includeSearchPartners,
          ...(args.startDateTime ? { startDateTime: args.startDateTime } : {}),
          ...(args.endDateTime ? { endDateTime: args.endDateTime } : {})
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_CREATE_AD_GROUP_TOOL) {
      const args = CreateAdGroupSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'create_ad_group',
        resourceType: 'ad_group',
        arguments: {
          name: args.name,
          campaignResourceName: args.campaignResourceName,
          ...(args.cpcBid === undefined ? {} : { cpcBid: args.cpcBid })
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_CREATE_RSA_TOOL) {
      const args = CreateResponsiveSearchAdSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'create_ad',
        resourceType: 'ad',
        arguments: {
          adGroupResourceName: args.adGroupResourceName,
          finalUrl: args.finalUrl,
          headlines: args.headlines,
          descriptions: args.descriptions,
          ...(args.path1 ? { path1: args.path1 } : {}),
          ...(args.path2 ? { path2: args.path2 } : {})
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_ADD_KEYWORDS_TOOL) {
      const args = AddKeywordsSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'add_keywords',
        resourceType: 'keyword',
        arguments: {
          adGroupResourceName: args.adGroupResourceName,
          keywords: args.keywords
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_LOCATIONS_TOOL) {
      const args = SetLocationsSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_locations',
        resourceType: 'location',
        arguments: {
          campaignResourceName: args.campaignResourceName,
          geoTargetConstantIds: args.geoTargetConstantIds
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_LOCATION_MATCH_MODE_TOOL) {
      const args = SetLocationMatchModeSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_location_match_mode',
        resourceType: 'location',
        arguments: {
          campaignResourceName: args.campaignResourceName,
          positiveGeoTargetType: args.positiveGeoTargetType
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_LANGUAGES_TOOL) {
      const args = SetLanguagesSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_languages',
        resourceType: 'language',
        arguments: {
          campaignResourceName: args.campaignResourceName,
          languageConstantIds: args.languageConstantIds
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_AD_SCHEDULE_TOOL) {
      const args = SetAdScheduleSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_ad_schedule',
        resourceType: 'ad_schedule',
        arguments: {
          campaignResourceName: args.campaignResourceName,
          schedules: args.schedules
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_DEVICES_TOOL) {
      const args = SetDevicesSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_devices',
        resourceType: 'device',
        arguments: {
          campaignResourceName: args.campaignResourceName,
          devices: args.devices
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_DEMOGRAPHICS_TOOL) {
      const args = SetDemographicsSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_demographics',
        resourceType: 'demographic',
        arguments: { adGroupResourceName: args.adGroupResourceName, criteria: args.criteria }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_PLACEMENTS_TOOL) {
      const args = SetPlacementsSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_placements',
        resourceType: 'placement',
        arguments: { scope: args.scope, parentResourceName: args.parentResourceName, urls: args.urls }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_CAMPAIGN_CONVERSION_GOALS_TOOL) {
      const args = SetCampaignConversionGoalsSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_campaign_conversion_goals',
        resourceType: 'conversion_goal',
        arguments: { campaignResourceName: args.campaignResourceName, goals: args.goals }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_CUSTOMER_GOAL_BIDDABILITY_TOOL) {
      const args = SetCustomerGoalBiddabilitySchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_customer_goal_biddability',
        resourceType: 'conversion_goal',
        arguments: { category: args.category, origin: args.origin, biddable: args.biddable }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_CONVERSION_PRIMARY_STATE_TOOL) {
      const args = SetConversionPrimaryStateSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_conversion_primary_state',
        resourceType: 'conversion_action',
        arguments: { resourceName: args.resourceName, primaryForGoal: args.primaryForGoal }
      }
    } else if (name === GOOGLE_ADS_PLAN_CREATE_CONVERSION_ACTION_TOOL) {
      const args = CreateConversionActionSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'create_conversion_action',
        resourceType: 'conversion_action',
        arguments: {
          name: args.name,
          type: args.type,
          category: args.category,
          countingType: args.countingType,
          clickThroughLookbackWindowDays: args.clickThroughLookbackWindowDays,
          ...(args.viewThroughLookbackWindowDays === undefined
            ? {}
            : { viewThroughLookbackWindowDays: args.viewThroughLookbackWindowDays })
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_UPDATE_CONVERSION_ACTION_TOOL) {
      const args = UpdateConversionActionSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'update_conversion_action',
        resourceType: 'conversion_action',
        arguments: {
          resourceName: args.resourceName,
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(args.category === undefined ? {} : { category: args.category }),
          ...(args.status === undefined ? {} : { status: args.status }),
          ...(args.countingType === undefined ? {} : { countingType: args.countingType }),
          ...(args.clickThroughLookbackWindowDays === undefined
            ? {}
            : { clickThroughLookbackWindowDays: args.clickThroughLookbackWindowDays }),
          ...(args.viewThroughLookbackWindowDays === undefined
            ? {}
            : { viewThroughLookbackWindowDays: args.viewThroughLookbackWindowDays })
        }
      }
    } else {
      throw new Error('Unsupported Google Ads Search planning tool')
    }
    const plan = await dependencies.plan(plannerInput, {
      actorRole: context.userRole,
      hasWriteScope
    }, flags)
    if (!plan.policyDecision.allowed || plan.status === 'cancelled') {
      return {
        ok: false,
        error: 'This Google Ads action was blocked by policy.',
        code: 'blocked'
      }
    }
    return {
      ok: true,
      data: {
        actionPlanId: plan.id,
        operation: plan.operation,
        resourceType: plan.resourceType,
        resourceName: plan.resourceName,
        riskTier: plan.riskTier,
        executionMode: plan.executionMode,
        status: plan.status,
        diff: plan.diff,
        expiresAt: plan.expiresAt
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: 'Invalid Google Ads Search action arguments.', code: 'bad_args' }
    }
    return { ok: false, error: 'Google Ads Search action planning failed.', code: 'handler_error' }
  }
}
