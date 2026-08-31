import { z } from 'zod'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { McpToolManifest } from '~~/server/utils/ai/mcp/project'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { PlanGoogleAdsActionInput } from '~~/server/utils/googleAds/actionPlanner'
import {
  planSearchGoogleAdsControlAction,
  type GoogleAdsControlFlags
} from '~~/server/utils/googleAds/searchRuntime'
import { ListingGroupNodesInputSchema } from '~~/server/utils/googleAds/listingGroups'

export const GOOGLE_ADS_PLAN_PAUSE_TOOL = 'google_ads_plan_pause'
export const GOOGLE_ADS_PLAN_ARCHIVE_TOOL = 'google_ads_plan_archive'
export const GOOGLE_ADS_PLAN_REMOVE_TOOL = 'google_ads_plan_remove'
export const GOOGLE_ADS_PLAN_ENABLE_TOOL = 'google_ads_plan_enable'
export const GOOGLE_ADS_PLAN_NEGATIVE_KEYWORDS_TOOL = 'google_ads_plan_add_negative_keywords'
export const GOOGLE_ADS_PLAN_REMOVE_NEGATIVE_KEYWORD_TOOL = 'google_ads_plan_remove_negative_keyword'
export const GOOGLE_ADS_PLAN_CREATE_BUDGET_TOOL = 'google_ads_plan_create_budget'
export const GOOGLE_ADS_PLAN_UPDATE_BUDGET_TOOL = 'google_ads_plan_update_budget'
export const GOOGLE_ADS_PLAN_CREATE_SEARCH_CAMPAIGN_TOOL = 'google_ads_plan_create_search_campaign'
export const GOOGLE_ADS_PLAN_UPDATE_CAMPAIGN_TOOL = 'google_ads_plan_update_campaign'
export const GOOGLE_ADS_PLAN_CREATE_AD_GROUP_TOOL = 'google_ads_plan_create_ad_group'
export const GOOGLE_ADS_PLAN_UPDATE_AD_GROUP_TOOL = 'google_ads_plan_update_ad_group'
export const GOOGLE_ADS_PLAN_CREATE_RSA_TOOL = 'google_ads_plan_create_responsive_search_ad'
export const GOOGLE_ADS_PLAN_ADD_KEYWORDS_TOOL = 'google_ads_plan_add_keywords'
export const GOOGLE_ADS_PLAN_UPDATE_KEYWORD_TOOL = 'google_ads_plan_update_keyword'
export const GOOGLE_ADS_PLAN_SET_LOCATIONS_TOOL = 'google_ads_plan_set_locations'
export const GOOGLE_ADS_PLAN_SET_LOCATION_MATCH_MODE_TOOL = 'google_ads_plan_set_location_match_mode'
export const GOOGLE_ADS_PLAN_SET_LANGUAGES_TOOL = 'google_ads_plan_set_languages'
export const GOOGLE_ADS_PLAN_SET_AD_SCHEDULE_TOOL = 'google_ads_plan_set_ad_schedule'
export const GOOGLE_ADS_PLAN_SET_DEVICES_TOOL = 'google_ads_plan_set_devices'
export const GOOGLE_ADS_PLAN_SET_DEMOGRAPHICS_TOOL = 'google_ads_plan_set_demographics'
export const GOOGLE_ADS_PLAN_SET_PLACEMENTS_TOOL = 'google_ads_plan_set_placements'
export const GOOGLE_ADS_PLAN_SET_CONTENT_EXCLUSIONS_TOOL = 'google_ads_plan_set_content_exclusions'
export const GOOGLE_ADS_PLAN_SET_AUDIENCE_ASSOCIATIONS_TOOL = 'google_ads_plan_set_audience_associations'
export const GOOGLE_ADS_PLAN_SET_CAMPAIGN_CONVERSION_GOALS_TOOL = 'google_ads_plan_set_campaign_conversion_goals'
export const GOOGLE_ADS_PLAN_SET_CAMPAIGN_GOAL_CONFIG_TOOL = 'google_ads_plan_set_campaign_goal_config'
export const GOOGLE_ADS_PLAN_SET_CUSTOMER_GOAL_BIDDABILITY_TOOL = 'google_ads_plan_set_customer_goal_biddability'
export const GOOGLE_ADS_PLAN_SET_CONVERSION_PRIMARY_STATE_TOOL = 'google_ads_plan_set_conversion_primary_state'
export const GOOGLE_ADS_PLAN_CREATE_CONVERSION_ACTION_TOOL = 'google_ads_plan_create_conversion_action'
export const GOOGLE_ADS_PLAN_UPDATE_CONVERSION_ACTION_TOOL = 'google_ads_plan_update_conversion_action'
export const GOOGLE_ADS_PLAN_ARCHIVE_CONVERSION_ACTION_TOOL = 'google_ads_plan_archive_conversion_action'
export const GOOGLE_ADS_PLAN_REMOVE_CONVERSION_ACTION_TOOL = 'google_ads_plan_remove_conversion_action'
export const GOOGLE_ADS_PLAN_CREATE_CUSTOM_CONVERSION_GOAL_TOOL = 'google_ads_plan_create_custom_conversion_goal'
export const GOOGLE_ADS_PLAN_UPDATE_CUSTOM_CONVERSION_GOAL_TOOL = 'google_ads_plan_update_custom_conversion_goal'
export const GOOGLE_ADS_PLAN_ARCHIVE_CUSTOM_CONVERSION_GOAL_TOOL = 'google_ads_plan_archive_custom_conversion_goal'
export const GOOGLE_ADS_PLAN_CREATE_ASSET_TOOL = 'google_ads_plan_create_asset'
export const GOOGLE_ADS_PLAN_ATTACH_ASSET_TOOL = 'google_ads_plan_attach_asset'
export const GOOGLE_ADS_PLAN_ARCHIVE_ASSET_LINK_TOOL = 'google_ads_plan_archive_asset_link'
export const GOOGLE_ADS_PLAN_DETACH_ASSET_TOOL = 'google_ads_plan_detach_asset'
export const GOOGLE_ADS_PLAN_CREATE_ASSET_GROUP_TOOL = 'google_ads_plan_create_asset_group'
export const GOOGLE_ADS_PLAN_UPDATE_ASSET_GROUP_TOOL = 'google_ads_plan_update_asset_group'
export const GOOGLE_ADS_PLAN_SET_ASSET_GROUP_ASSETS_TOOL = 'google_ads_plan_set_asset_group_assets'
export const GOOGLE_ADS_PLAN_SET_LISTING_GROUPS_TOOL = 'google_ads_plan_set_listing_groups'
export const GOOGLE_ADS_PLAN_APPLY_RECOMMENDATION_TOOL = 'google_ads_plan_apply_recommendation'
export const GOOGLE_ADS_PLAN_DISMISS_RECOMMENDATION_TOOL = 'google_ads_plan_dismiss_recommendation'
export const GOOGLE_ADS_PLAN_CREATE_CUSTOM_AUDIENCE_TOOL = 'google_ads_plan_create_custom_audience'
export const GOOGLE_ADS_PLAN_UPDATE_CUSTOM_AUDIENCE_TOOL = 'google_ads_plan_update_custom_audience'
export const GOOGLE_ADS_PLAN_ARCHIVE_CUSTOM_AUDIENCE_TOOL = 'google_ads_plan_archive_custom_audience'
export const GOOGLE_ADS_PLAN_SET_PMAX_AUDIENCE_SIGNALS_TOOL = 'google_ads_plan_set_pmax_audience_signals'
export const GOOGLE_ADS_PLAN_SET_PMAX_SEARCH_THEMES_TOOL = 'google_ads_plan_set_pmax_search_themes'

const CommonSchema = {
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(255)
}
const OperatorReasonSchema = z.string().trim().min(10).max(1_000)
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
const RemoveEntitySchema = z.strictObject({
  ...CommonSchema,
  entityType: EntityTypeSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  reason: OperatorReasonSchema
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
const RemoveNegativeKeywordSchema = z.strictObject({
  ...CommonSchema,
  scope: z.enum(['campaign', 'ad_group']),
  resourceName: z.string().trim().min(1).max(1_000),
  reason: OperatorReasonSchema
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
const UpdateCampaignSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  name: z.string().trim().min(1).max(255).optional(),
  budgetResourceName: z.string().trim().min(1).max(1_000).optional(),
  includeSearchPartners: z.boolean().optional(),
  startDateTime: CampaignDateTimeSchema.optional(),
  endDateTime: CampaignDateTimeSchema.optional()
}).superRefine((value, refinement) => {
  if (value.name === undefined && value.budgetResourceName === undefined
    && value.includeSearchPartners === undefined && value.startDateTime === undefined
    && value.endDateTime === undefined) {
    refinement.addIssue({ code: 'custom', message: 'At least one mutable campaign field is required' })
  }
})
const CreateAdGroupSchema = z.strictObject({
  ...CommonSchema,
  name: z.string().trim().min(1).max(255),
  campaignResourceName: z.string().trim().min(1).max(1_000),
  cpcBid: z.number().finite().positive().max(1_000_000).optional()
})
const UpdateAdGroupSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  name: z.string().trim().min(1).max(255).optional(),
  cpcBid: z.number().finite().positive().max(1_000_000).optional()
}).superRefine((value, refinement) => {
  if (value.name === undefined && value.cpcBid === undefined) {
    refinement.addIssue({ code: 'custom', message: 'At least one mutable ad-group field is required' })
  }
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
const UpdateKeywordSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  cpcBid: z.number().finite().positive().max(1_000_000).optional(),
  finalUrl: z.string().url().refine(value => value.startsWith('https://')).optional()
}).superRefine((value, refinement) => {
  if (value.cpcBid === undefined && value.finalUrl === undefined) {
    refinement.addIssue({ code: 'custom', message: 'At least one mutable keyword field is required' })
  }
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
const ContentLabelTypeSchema = z.enum([
  'BELOW_THE_FOLD', 'BRAND_SUITABILITY_CONTENT_FOR_FAMILIES', 'BRAND_SUITABILITY_GAMES_FIGHTING',
  'BRAND_SUITABILITY_GAMES_MATURE', 'BRAND_SUITABILITY_HEALTH_SENSITIVE',
  'BRAND_SUITABILITY_HEALTH_SOURCE_UNDETERMINED', 'LIVE_STREAMING_VIDEO', 'PARKED_DOMAIN',
  'PROFANITY', 'SEXUALLY_SUGGESTIVE', 'SOCIAL_ISSUES', 'TRAGEDY', 'VIDEO', 'VIDEO_NOT_YET_RATED',
  'VIDEO_RATING_DV_G', 'VIDEO_RATING_DV_MA', 'VIDEO_RATING_DV_PG', 'VIDEO_RATING_DV_T'
])
const SetContentExclusionsSchema = z.strictObject({
  ...CommonSchema,
  campaignResourceName: z.string().trim().min(1).max(1_000),
  labels: z.array(ContentLabelTypeSchema).max(18)
}).superRefine((value, refinement) => {
  if (new Set(value.labels).size !== value.labels.length) {
    refinement.addIssue({ code: 'custom', message: 'Content-exclusion labels must be unique' })
  }
})
const SetAudienceAssociationsSchema = z.strictObject({
  ...CommonSchema,
  adGroupResourceName: z.string().trim().min(1).max(1_000),
  audienceResourceNames: z.array(z.string().trim().min(1).max(1_000)).max(1_000),
  mode: z.enum(['TARGETING', 'OBSERVATION'])
}).superRefine((value, refinement) => {
  if (new Set(value.audienceResourceNames).size !== value.audienceResourceNames.length) {
    refinement.addIssue({ code: 'custom', message: 'Audience resource names must be unique' })
  }
})
const CustomAudienceMemberSchema = z.strictObject({
  type: z.enum(['KEYWORD', 'URL', 'APP', 'PLACE_CATEGORY']),
  value: z.string().trim().min(1).max(2_048)
}).superRefine((member, refinement) => {
  if (member.type === 'KEYWORD') {
    if (member.value.length > 80 || member.value.split(/\s+/u).length > 10) {
      refinement.addIssue({ code: 'custom', message: 'Custom-audience keywords may contain at most 10 words and 80 characters' })
    }
    return
  }
  if (member.type === 'URL') {
    try {
      const protocol = new URL(member.value).protocol
      if (protocol !== 'http:' && protocol !== 'https:') throw new Error('unsupported protocol')
    } catch {
      refinement.addIssue({ code: 'custom', message: 'Custom-audience URLs must be valid HTTP or HTTPS URLs' })
    }
    return
  }
  if (member.type === 'APP' && (
    member.value.length > 255
    || !/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(member.value)
  )) {
    refinement.addIssue({ code: 'custom', message: 'Custom-audience apps must be Android package names' })
  }
  if (member.type === 'PLACE_CATEGORY' && !/^\d{1,20}$/.test(member.value)) {
    refinement.addIssue({ code: 'custom', message: 'Custom-audience place categories must be numeric IDs' })
  }
})
const CustomAudienceMembersSchema = z.array(CustomAudienceMemberSchema).min(1).max(1_000)
  .superRefine((members, refinement) => {
    const keys = members.map(member => `${member.type}:${member.value}`)
    if (new Set(keys).size !== keys.length) {
      refinement.addIssue({ code: 'custom', message: 'Custom-audience members must be unique' })
    }
  })
const CreateCustomAudienceSchema = z.strictObject({
  ...CommonSchema,
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10_000).default(''),
  type: z.enum(['AUTO', 'SEARCH']),
  members: CustomAudienceMembersSchema
})
const UpdateCustomAudienceSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(10_000).optional(),
  type: z.enum(['AUTO', 'SEARCH']).optional(),
  members: CustomAudienceMembersSchema.optional()
}).superRefine((value, refinement) => {
  if (value.name === undefined && value.description === undefined
    && value.type === undefined && value.members === undefined) {
    refinement.addIssue({ code: 'custom', message: 'At least one mutable custom-audience field is required' })
  }
})
const ArchiveCustomAudienceSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  reason: OperatorReasonSchema
})
const SetPmaxAudienceSignalsSchema = z.strictObject({
  ...CommonSchema,
  assetGroupResourceName: z.string().trim().min(1).max(1_000),
  audienceResourceNames: z.array(z.string().trim().min(1).max(1_000)).max(500)
}).superRefine((value, refinement) => {
  if (new Set(value.audienceResourceNames).size !== value.audienceResourceNames.length) {
    refinement.addIssue({ code: 'custom', message: 'Performance Max audience signals must be unique' })
  }
})
const SearchThemeTextSchema = z.string().trim().min(1).max(80).refine(
  value => value.replace(/\s+/g, ' ').split(' ').length <= 10,
  { message: 'Search themes may contain at most 10 words' }
)
const SetPmaxSearchThemesSchema = z.strictObject({
  ...CommonSchema,
  assetGroupResourceName: z.string().trim().min(1).max(1_000),
  themes: z.array(SearchThemeTextSchema).max(25)
}).superRefine((value, refinement) => {
  const keys = value.themes.map(theme => theme.replace(/\s+/g, ' ').toLocaleLowerCase('en-AU'))
  if (new Set(keys).size !== keys.length) {
    refinement.addIssue({ code: 'custom', message: 'Search themes must be unique' })
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
const SetCampaignGoalConfigSchema = z.strictObject({
  ...CommonSchema,
  campaignResourceName: z.string().trim().min(1).max(1_000),
  mode: z.enum(['CUSTOMER_DEFAULTS', 'CAMPAIGN_GOALS', 'CUSTOM_GOAL']),
  customConversionGoalResourceName: z.string().trim().min(1).max(1_000).optional()
}).superRefine((value, refinement) => {
  if (value.mode === 'CUSTOM_GOAL' && value.customConversionGoalResourceName === undefined) {
    refinement.addIssue({ code: 'custom', message: 'CUSTOM_GOAL mode requires a custom conversion goal' })
  }
  if (value.mode !== 'CUSTOM_GOAL' && value.customConversionGoalResourceName !== undefined) {
    refinement.addIssue({ code: 'custom', message: 'A custom conversion goal is only valid in CUSTOM_GOAL mode' })
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
const ConversionActionDispositionSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000)
})
const RemoveConversionActionSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  reason: OperatorReasonSchema
})
const CreateCustomConversionGoalSchema = z.strictObject({
  ...CommonSchema,
  name: z.string().trim().min(1).max(255),
  conversionActionResourceNames: z.array(z.string().trim().min(1).max(1_000)).min(1).max(100)
}).superRefine((value, refinement) => {
  if (new Set(value.conversionActionResourceNames).size !== value.conversionActionResourceNames.length) {
    refinement.addIssue({ code: 'custom', message: 'Custom conversion-goal actions must be unique' })
  }
})
const UpdateCustomConversionGoalSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  name: z.string().trim().min(1).max(255).optional(),
  conversionActionResourceNames: z.array(z.string().trim().min(1).max(1_000)).min(1).max(100).optional()
}).superRefine((value, refinement) => {
  if (value.name === undefined && value.conversionActionResourceNames === undefined) {
    refinement.addIssue({ code: 'custom', message: 'At least one mutable custom conversion-goal field is required' })
  }
  if (value.conversionActionResourceNames
    && new Set(value.conversionActionResourceNames).size !== value.conversionActionResourceNames.length) {
    refinement.addIssue({ code: 'custom', message: 'Custom conversion-goal actions must be unique' })
  }
})
const ArchiveCustomConversionGoalSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  reason: OperatorReasonSchema
})
const AssetNameSchema = z.string().trim().min(1).max(255).optional()
const HttpsAssetUrlSchema = z.string().url().refine(value => value.startsWith('https://'))
const StructuredSnippetHeaderSchema = z.enum([
  'Brands', 'Amenities', 'Styles', 'Types', 'Destinations', 'Services', 'Courses',
  'Neighbourhoods', 'Shows', 'Insurance coverage', 'Degree programmes', 'Featured hotels', 'Models'
])
const CreateAssetSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...CommonSchema,
    type: z.literal('CALL'),
    name: AssetNameSchema,
    countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/),
    phoneNumber: z.string().trim().min(3).max(30)
  }),
  z.strictObject({
    ...CommonSchema,
    type: z.literal('SITELINK'),
    name: AssetNameSchema,
    linkText: z.string().trim().min(1).max(25),
    description1: z.string().trim().min(1).max(35).optional(),
    description2: z.string().trim().min(1).max(35).optional(),
    finalUrl: HttpsAssetUrlSchema,
    finalMobileUrl: HttpsAssetUrlSchema.optional()
  }),
  z.strictObject({
    ...CommonSchema,
    type: z.literal('CALLOUT'),
    name: AssetNameSchema,
    calloutText: z.string().trim().min(1).max(25)
  }),
  z.strictObject({
    ...CommonSchema,
    type: z.literal('STRUCTURED_SNIPPET'),
    name: AssetNameSchema,
    header: StructuredSnippetHeaderSchema,
    values: z.array(z.string().trim().min(1).max(25)).min(3).max(10)
  })
]).superRefine((value, refinement) => {
  if (value.type === 'SITELINK' && (value.description1 === undefined) !== (value.description2 === undefined)) {
    refinement.addIssue({ code: 'custom', message: 'Sitelink descriptions must be supplied together' })
  }
  if (value.type === 'STRUCTURED_SNIPPET'
    && new Set(value.values.map(item => item.toLocaleLowerCase('en-AU'))).size !== value.values.length) {
    refinement.addIssue({ code: 'custom', message: 'Structured-snippet values must be unique' })
  }
})
const AssetLinkScopeSchema = z.enum(['customer', 'campaign', 'ad_group'])
const AssetExtensionFieldTypeSchema = z.enum(['CALL', 'SITELINK', 'CALLOUT', 'STRUCTURED_SNIPPET'])
const AttachAssetSchema = z.strictObject({
  ...CommonSchema,
  scope: AssetLinkScopeSchema,
  parentResourceName: z.string().trim().min(1).max(1_000),
  assetResourceName: z.string().trim().min(1).max(1_000),
  fieldType: AssetExtensionFieldTypeSchema
})
const ArchiveAssetLinkSchema = z.strictObject({
  ...CommonSchema,
  scope: AssetLinkScopeSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  requestedMode: z.enum(['proposal', 'automatic']).default('proposal')
})
const DetachAssetSchema = z.strictObject({
  ...CommonSchema,
  scope: AssetLinkScopeSchema,
  resourceName: z.string().trim().min(1).max(1_000)
})
const PmaxAssetFieldTypeSchema = z.enum([
  'HEADLINE', 'LONG_HEADLINE', 'DESCRIPTION', 'MARKETING_IMAGE',
  'SQUARE_MARKETING_IMAGE', 'BUSINESS_NAME', 'LOGO', 'PORTRAIT_MARKETING_IMAGE',
  'LANDSCAPE_LOGO', 'YOUTUBE_VIDEO', 'CALL_TO_ACTION_SELECTION', 'MEDIA_BUNDLE'
])
const CreateAssetGroupSchema = z.strictObject({
  ...CommonSchema,
  campaignResourceName: z.string().trim().min(1).max(1_000),
  name: z.string().trim().min(1).max(128),
  finalUrls: z.array(HttpsAssetUrlSchema).min(1).max(10),
  finalMobileUrls: z.array(HttpsAssetUrlSchema).max(10).default([]),
  path1: z.string().trim().min(1).max(15).optional(),
  path2: z.string().trim().min(1).max(15).optional(),
  assets: z.array(z.strictObject({
    fieldType: PmaxAssetFieldTypeSchema,
    assetResourceName: z.string().trim().min(1).max(1_000)
  })).max(128)
}).superRefine((value, refinement) => {
  if (value.path2 !== undefined && value.path1 === undefined) {
    refinement.addIssue({ code: 'custom', message: 'Asset-group path2 requires path1' })
  }
  if (new Set(value.finalUrls).size !== value.finalUrls.length
    || new Set(value.finalMobileUrls).size !== value.finalMobileUrls.length) {
    refinement.addIssue({ code: 'custom', message: 'Asset-group final URLs must be unique' })
  }
  const keys = value.assets.map(asset => `${asset.fieldType}:${asset.assetResourceName}`)
  if (new Set(keys).size !== keys.length) {
    refinement.addIssue({ code: 'custom', message: 'Asset-group links must be unique' })
  }
})
const NullableAssetGroupPathSchema = z.union([
  z.string().trim().min(1).max(15),
  z.null()
])
const UpdateAssetGroupSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000),
  name: z.string().trim().min(1).max(128).optional(),
  finalUrls: z.array(HttpsAssetUrlSchema).min(1).max(10).optional(),
  finalMobileUrls: z.array(HttpsAssetUrlSchema).max(10).optional(),
  path1: NullableAssetGroupPathSchema.optional(),
  path2: NullableAssetGroupPathSchema.optional(),
  status: z.enum(['ENABLED', 'PAUSED']).optional()
}).superRefine((value, refinement) => {
  if (value.name === undefined && value.finalUrls === undefined
    && value.finalMobileUrls === undefined && value.path1 === undefined
    && value.path2 === undefined && value.status === undefined) {
    refinement.addIssue({ code: 'custom', message: 'At least one mutable asset-group field is required' })
  }
  if (value.finalUrls && new Set(value.finalUrls).size !== value.finalUrls.length) {
    refinement.addIssue({ code: 'custom', message: 'Asset-group final URLs must be unique' })
  }
  if (value.finalMobileUrls && new Set(value.finalMobileUrls).size !== value.finalMobileUrls.length) {
    refinement.addIssue({ code: 'custom', message: 'Asset-group final mobile URLs must be unique' })
  }
})
const SetAssetGroupAssetsSchema = z.strictObject({
  ...CommonSchema,
  assetGroupResourceName: z.string().trim().min(1).max(1_000),
  assets: z.array(z.strictObject({
    fieldType: PmaxAssetFieldTypeSchema,
    assetResourceName: z.string().trim().min(1).max(1_000)
  })).max(128)
}).superRefine((value, refinement) => {
  const keys = value.assets.map(asset => `${asset.fieldType}:${asset.assetResourceName}`)
  if (new Set(keys).size !== keys.length) {
    refinement.addIssue({ code: 'custom', message: 'Asset-group links must be unique' })
  }
})
const SetListingGroupsSchema = z.strictObject({
  ...CommonSchema,
  assetGroupResourceName: z.string().trim().min(1).max(1_000),
  nodes: ListingGroupNodesInputSchema
})
const RecommendationSchema = z.strictObject({
  ...CommonSchema,
  resourceName: z.string().trim().min(1).max(1_000)
})
const DismissRecommendationSchema = RecommendationSchema.extend({
  requestedMode: z.enum(['proposal', 'automatic']).default('proposal')
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
    GOOGLE_ADS_PLAN_REMOVE_TOOL,
    'Plan permanent Google Ads removal of one campaign, ad group, ad, or keyword with a required operator reason. Use pause or archive for the safe reversible default.',
    RemoveEntitySchema
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
    GOOGLE_ADS_PLAN_REMOVE_NEGATIVE_KEYWORD_TOOL,
    'Plan permanent removal of one campaign or ad-group negative keyword with a required operator reason. This is destructive and is never automatic.',
    RemoveNegativeKeywordSchema
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
    GOOGLE_ADS_PLAN_UPDATE_CAMPAIGN_TOOL,
    'Plan an exact update to mutable campaign identity, budget assignment, Search partner setting, or serving dates. The campaign remains in its current status.',
    UpdateCampaignSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_CREATE_AD_GROUP_TOOL,
    'Plan a standard Search ad group under an existing campaign. New ad groups are always created paused.',
    CreateAdGroupSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_UPDATE_AD_GROUP_TOOL,
    'Plan an exact update to an ad-group name or CPC bid. Bid changes require elevated approval and preserve the current status.',
    UpdateAdGroupSchema
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
    GOOGLE_ADS_PLAN_UPDATE_KEYWORD_TOOL,
    'Plan an exact CPC bid or HTTPS final-URL update for one positive keyword. Keyword text and match type are immutable and are never rewritten.',
    UpdateKeywordSchema
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
    GOOGLE_ADS_PLAN_SET_CONTENT_EXCLUSIONS_TOOL,
    'Plan an atomic replacement of campaign-level Google Ads v25 content-label exclusions.',
    SetContentExclusionsSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_AUDIENCE_ASSOCIATIONS_TOOL,
    'Plan grouped ad-group Audience associations together with TARGETING or OBSERVATION mode. Multi-service writes are fully prevalidated and read-back verified.',
    SetAudienceAssociationsSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_CAMPAIGN_CONVERSION_GOALS_TOOL,
    'Plan campaign conversion-goal biddability by typed conversion category and origin. Explicit false values prevent campaign bidding on that goal.',
    SetCampaignConversionGoalsSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_CAMPAIGN_GOAL_CONFIG_TOOL,
    'Plan whether a campaign uses account defaults, campaign category/origin goals, or one custom conversion goal. The mode makes clearing behavior explicit.',
    SetCampaignGoalConfigSchema
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
  ),
  manifest(
    GOOGLE_ADS_PLAN_ARCHIVE_CONVERSION_ACTION_TOOL,
    'Plan the safe default for retiring a conversion action by setting it to HIDDEN. This stops recording and hides the action without provider removal.',
    ConversionActionDispositionSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_REMOVE_CONVERSION_ACTION_TOOL,
    'Plan permanent provider removal of a conversion action with a required operator reason. This requires the destructive feature gate and owner/admin confirmation.',
    RemoveConversionActionSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_CREATE_CUSTOM_CONVERSION_GOAL_TOOL,
    'Plan a typed custom conversion goal using a bounded, unique set of conversion actions owned by the selected conversion customer.',
    CreateCustomConversionGoalSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_UPDATE_CUSTOM_CONVERSION_GOAL_TOOL,
    'Plan an exact typed update to a custom conversion goal. Supplying conversion actions replaces the complete action list.',
    UpdateCustomConversionGoalSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_ARCHIVE_CUSTOM_CONVERSION_GOAL_TOOL,
    'Plan archiving a custom conversion goal with a required operator reason. Google reports only ENABLED or REMOVED, so owner/admin destructive confirmation is required.',
    ArchiveCustomConversionGoalSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_CREATE_ASSET_TOOL,
    'Plan an immutable typed call, sitelink, callout, or Australian-English structured-snippet asset. Creation does not make the asset serve; attach it separately after approval.',
    CreateAssetSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_ATTACH_ASSET_TOOL,
    'Plan attaching or resuming an approved extension asset at account, campaign, or ad-group level. Attachment enables serving and requires elevated approval.',
    AttachAssetSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_ARCHIVE_ASSET_LINK_TOOL,
    'Plan the safe reversible retirement of an asset link by setting it to PAUSED. Automatic mode requires a bounded asset-detachment policy.',
    ArchiveAssetLinkSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_DETACH_ASSET_TOOL,
    'Plan explicit removal of an account, campaign, or ad-group asset association. The underlying immutable asset is retained and can be reattached.',
    DetachAssetSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_CREATE_ASSET_GROUP_TOOL,
    'Plan an atomic, paused Performance Max asset group. Standard campaigns require a complete minimum asset bundle; retail campaigns may start without advertiser assets.',
    CreateAssetGroupSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_UPDATE_ASSET_GROUP_TOOL,
    'Plan an exact update to mutable Performance Max asset-group fields. Set status to PAUSED for the reversible archive default or ENABLED to resume serving.',
    UpdateAssetGroupSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_ASSET_GROUP_ASSETS_TOOL,
    'Plan an atomic exact replacement of Performance Max asset-group membership. Minimum asset requirements and brand-guideline placement are validated before proposal.',
    SetAssetGroupAssetsSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_LISTING_GROUPS_TOOL,
    'Plan an atomic exact replacement of a Performance Max retail product listing-group tree. Subdivisions require one explicit branch and exactly one Other branch.',
    SetListingGroupsSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_APPLY_RECOMMENDATION_TOOL,
    'Plan applying one live Google Ads recommendation using its provider-recommended defaults. The exact recommendation is re-read before an elevated approval write.',
    RecommendationSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_DISMISS_RECOMMENDATION_TOOL,
    'Plan dismissing one live Google Ads recommendation. Policy-limited automatic mode requires an active recommendation-dismissal grant.',
    DismissRecommendationSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_CREATE_CUSTOM_AUDIENCE_TOOL,
    'Plan a typed custom audience using bounded keyword, HTTP(S) URL, Android app, or place-category members. New audiences require elevated approval.',
    CreateCustomAudienceSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_UPDATE_CUSTOM_AUDIENCE_TOOL,
    'Plan a typed custom-audience update. Providing members replaces the complete member list and is verified after mutation.',
    UpdateCustomAudienceSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_ARCHIVE_CUSTOM_AUDIENCE_TOOL,
    'Plan archiving a custom audience with a required operator reason. Google implements archive as removal and reports REMOVED, so owner/admin destructive confirmation is required.',
    ArchiveCustomAudienceSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_PMAX_AUDIENCE_SIGNALS_TOOL,
    'Plan an exact replacement of Audience hints for one Performance Max asset group. Other signal types are preserved and the change requires elevated approval.',
    SetPmaxAudienceSignalsSchema
  ),
  manifest(
    GOOGLE_ADS_PLAN_SET_PMAX_SEARCH_THEMES_TOOL,
    'Plan an exact replacement of up to 25 unique Search themes for one Performance Max asset group. Audience and other signal types are preserved.',
    SetPmaxSearchThemesSchema
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

const REMOVE_OPERATIONS = {
  campaign: 'remove_campaign',
  ad_group: 'remove_ad_group',
  ad: 'remove_ad',
  keyword: 'remove_keyword'
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
    } else if (name === GOOGLE_ADS_PLAN_REMOVE_TOOL) {
      const args = RemoveEntitySchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp' as const,
        requestedMode: 'proposal' as const,
        operation: REMOVE_OPERATIONS[args.entityType],
        resourceType: ENTITY_RESOURCE_TYPES[args.entityType],
        arguments: { resourceName: args.resourceName, reason: args.reason }
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
    } else if (name === GOOGLE_ADS_PLAN_REMOVE_NEGATIVE_KEYWORD_TOOL) {
      const args = RemoveNegativeKeywordSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'remove_negative_keyword',
        resourceType: 'negative_keyword',
        arguments: {
          scope: args.scope,
          resourceName: args.resourceName,
          reason: args.reason
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
    } else if (name === GOOGLE_ADS_PLAN_UPDATE_CAMPAIGN_TOOL) {
      const args = UpdateCampaignSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'update_campaign',
        resourceType: 'campaign',
        arguments: {
          resourceName: args.resourceName,
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(args.budgetResourceName === undefined ? {} : { budgetResourceName: args.budgetResourceName }),
          ...(args.includeSearchPartners === undefined ? {} : { includeSearchPartners: args.includeSearchPartners }),
          ...(args.startDateTime === undefined ? {} : { startDateTime: args.startDateTime }),
          ...(args.endDateTime === undefined ? {} : { endDateTime: args.endDateTime })
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
    } else if (name === GOOGLE_ADS_PLAN_UPDATE_AD_GROUP_TOOL) {
      const args = UpdateAdGroupSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'update_ad_group',
        resourceType: 'ad_group',
        arguments: {
          resourceName: args.resourceName,
          ...(args.name === undefined ? {} : { name: args.name }),
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
    } else if (name === GOOGLE_ADS_PLAN_UPDATE_KEYWORD_TOOL) {
      const args = UpdateKeywordSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'update_keyword',
        resourceType: 'keyword',
        arguments: {
          resourceName: args.resourceName,
          ...(args.cpcBid === undefined ? {} : { cpcBid: args.cpcBid }),
          ...(args.finalUrl === undefined ? {} : { finalUrl: args.finalUrl })
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
    } else if (name === GOOGLE_ADS_PLAN_SET_CONTENT_EXCLUSIONS_TOOL) {
      const args = SetContentExclusionsSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_content_exclusions',
        resourceType: 'content_exclusion',
        arguments: { campaignResourceName: args.campaignResourceName, labels: args.labels }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_AUDIENCE_ASSOCIATIONS_TOOL) {
      const args = SetAudienceAssociationsSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_audience_associations',
        resourceType: 'audience',
        arguments: {
          adGroupResourceName: args.adGroupResourceName,
          audienceResourceNames: args.audienceResourceNames,
          mode: args.mode
        }
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
    } else if (name === GOOGLE_ADS_PLAN_SET_CAMPAIGN_GOAL_CONFIG_TOOL) {
      const args = SetCampaignGoalConfigSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_conversion_goal',
        resourceType: 'conversion_goal',
        arguments: {
          campaignResourceName: args.campaignResourceName,
          mode: args.mode,
          ...(args.customConversionGoalResourceName === undefined
            ? {}
            : { customConversionGoalResourceName: args.customConversionGoalResourceName })
        }
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
    } else if (name === GOOGLE_ADS_PLAN_ARCHIVE_CONVERSION_ACTION_TOOL) {
      const args = ConversionActionDispositionSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'archive_conversion_action',
        resourceType: 'conversion_action',
        arguments: { resourceName: args.resourceName }
      }
    } else if (name === GOOGLE_ADS_PLAN_REMOVE_CONVERSION_ACTION_TOOL) {
      const args = RemoveConversionActionSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'remove_conversion_action',
        resourceType: 'conversion_action',
        arguments: { resourceName: args.resourceName, reason: args.reason }
      }
    } else if (name === GOOGLE_ADS_PLAN_CREATE_CUSTOM_CONVERSION_GOAL_TOOL) {
      const args = CreateCustomConversionGoalSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'create_custom_conversion_goal',
        resourceType: 'custom_conversion_goal',
        arguments: {
          name: args.name,
          conversionActionResourceNames: args.conversionActionResourceNames
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_UPDATE_CUSTOM_CONVERSION_GOAL_TOOL) {
      const args = UpdateCustomConversionGoalSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'update_custom_conversion_goal',
        resourceType: 'custom_conversion_goal',
        arguments: {
          resourceName: args.resourceName,
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(args.conversionActionResourceNames === undefined
            ? {}
            : { conversionActionResourceNames: args.conversionActionResourceNames })
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_ARCHIVE_CUSTOM_CONVERSION_GOAL_TOOL) {
      const args = ArchiveCustomConversionGoalSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'archive_custom_conversion_goal',
        resourceType: 'custom_conversion_goal',
        arguments: { resourceName: args.resourceName, reason: args.reason }
      }
    } else if (name === GOOGLE_ADS_PLAN_CREATE_ASSET_TOOL) {
      const args = CreateAssetSchema.parse(rawArgs)
      const common = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp' as const,
        requestedMode: 'proposal' as const,
        operation: 'create_asset' as const,
        resourceType: 'asset' as const
      }
      if (args.type === 'CALL') {
        plannerInput = {
          ...common,
          arguments: {
            type: args.type,
            ...(args.name ? { name: args.name } : {}),
            countryCode: args.countryCode,
            phoneNumber: args.phoneNumber
          }
        }
      } else if (args.type === 'SITELINK') {
        plannerInput = {
          ...common,
          arguments: {
            type: args.type,
            ...(args.name ? { name: args.name } : {}),
            linkText: args.linkText,
            ...(args.description1 ? { description1: args.description1, description2: args.description2 } : {}),
            finalUrl: args.finalUrl,
            ...(args.finalMobileUrl ? { finalMobileUrl: args.finalMobileUrl } : {})
          }
        }
      } else if (args.type === 'CALLOUT') {
        plannerInput = {
          ...common,
          arguments: {
            type: args.type,
            ...(args.name ? { name: args.name } : {}),
            calloutText: args.calloutText
          }
        }
      } else {
        plannerInput = {
          ...common,
          arguments: {
            type: args.type,
            ...(args.name ? { name: args.name } : {}),
            header: args.header,
            values: args.values
          }
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_ATTACH_ASSET_TOOL) {
      const args = AttachAssetSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'attach_asset',
        resourceType: 'asset_link',
        arguments: {
          scope: args.scope,
          parentResourceName: args.parentResourceName,
          assetResourceName: args.assetResourceName,
          fieldType: args.fieldType
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_ARCHIVE_ASSET_LINK_TOOL) {
      const args = ArchiveAssetLinkSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: args.requestedMode,
        operation: 'archive_asset_link',
        resourceType: 'asset_link',
        arguments: { scope: args.scope, resourceName: args.resourceName }
      }
    } else if (name === GOOGLE_ADS_PLAN_DETACH_ASSET_TOOL) {
      const args = DetachAssetSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'detach_asset',
        resourceType: 'asset_link',
        arguments: { scope: args.scope, resourceName: args.resourceName }
      }
    } else if (name === GOOGLE_ADS_PLAN_CREATE_ASSET_GROUP_TOOL) {
      const args = CreateAssetGroupSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'create_asset_group',
        resourceType: 'asset_group',
        arguments: {
          campaignResourceName: args.campaignResourceName,
          name: args.name,
          finalUrls: args.finalUrls,
          ...(args.finalMobileUrls.length > 0 ? { finalMobileUrls: args.finalMobileUrls } : {}),
          ...(args.path1 ? { path1: args.path1 } : {}),
          ...(args.path2 ? { path2: args.path2 } : {}),
          assets: args.assets
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_UPDATE_ASSET_GROUP_TOOL) {
      const args = UpdateAssetGroupSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'update_asset_group',
        resourceType: 'asset_group',
        arguments: {
          resourceName: args.resourceName,
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(args.finalUrls === undefined ? {} : { finalUrls: args.finalUrls }),
          ...(args.finalMobileUrls === undefined ? {} : { finalMobileUrls: args.finalMobileUrls }),
          ...(args.path1 === undefined ? {} : { path1: args.path1 }),
          ...(args.path2 === undefined ? {} : { path2: args.path2 }),
          ...(args.status === undefined ? {} : { status: args.status })
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_ASSET_GROUP_ASSETS_TOOL) {
      const args = SetAssetGroupAssetsSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'manage_asset_group_assets',
        resourceType: 'asset_group',
        arguments: {
          assetGroupResourceName: args.assetGroupResourceName,
          assets: args.assets
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_LISTING_GROUPS_TOOL) {
      const args = SetListingGroupsSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'manage_listing_groups',
        resourceType: 'listing_group',
        arguments: {
          assetGroupResourceName: args.assetGroupResourceName,
          nodes: args.nodes
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_APPLY_RECOMMENDATION_TOOL) {
      const args = RecommendationSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'apply_recommendation',
        resourceType: 'recommendation',
        arguments: { resourceName: args.resourceName }
      }
    } else if (name === GOOGLE_ADS_PLAN_DISMISS_RECOMMENDATION_TOOL) {
      const args = DismissRecommendationSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: args.requestedMode,
        operation: 'dismiss_recommendation',
        resourceType: 'recommendation',
        arguments: { resourceName: args.resourceName }
      }
    } else if (name === GOOGLE_ADS_PLAN_CREATE_CUSTOM_AUDIENCE_TOOL) {
      const args = CreateCustomAudienceSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'manage_custom_audience',
        resourceType: 'custom_audience',
        arguments: {
          action: 'create',
          name: args.name,
          description: args.description,
          type: args.type,
          members: args.members
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_UPDATE_CUSTOM_AUDIENCE_TOOL) {
      const args = UpdateCustomAudienceSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'manage_custom_audience',
        resourceType: 'custom_audience',
        arguments: {
          action: 'update',
          resourceName: args.resourceName,
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(args.description === undefined ? {} : { description: args.description }),
          ...(args.type === undefined ? {} : { type: args.type }),
          ...(args.members === undefined ? {} : { members: args.members })
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_ARCHIVE_CUSTOM_AUDIENCE_TOOL) {
      const args = ArchiveCustomAudienceSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'archive_custom_audience',
        resourceType: 'custom_audience',
        arguments: { resourceName: args.resourceName, reason: args.reason }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_PMAX_AUDIENCE_SIGNALS_TOOL) {
      const args = SetPmaxAudienceSignalsSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_pmax_signals',
        resourceType: 'audience',
        arguments: {
          assetGroupResourceName: args.assetGroupResourceName,
          audienceResourceNames: args.audienceResourceNames
        }
      }
    } else if (name === GOOGLE_ADS_PLAN_SET_PMAX_SEARCH_THEMES_TOOL) {
      const args = SetPmaxSearchThemesSchema.parse(rawArgs)
      plannerInput = {
        clientId: args.clientId,
        connectionId: args.connectionId,
        idempotencyKey: args.idempotencyKey,
        actorId: context.userId,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'set_search_themes',
        resourceType: 'search_theme',
        arguments: {
          assetGroupResourceName: args.assetGroupResourceName,
          themes: args.themes
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
