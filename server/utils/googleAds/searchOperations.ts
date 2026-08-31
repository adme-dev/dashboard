import { z } from 'zod'
import type {
  BuildGoogleAdsActionContext,
  BuiltGoogleAdsAction
} from '~~/server/utils/googleAds/actionPlanner'
import type { GoogleAdsOperationType } from '~~/server/utils/googleAds/contracts'
import {
  buildListingGroupProviderOperations,
  ExistingListingGroupFilterSchema,
  ListingGroupNodesInputSchema,
  normalizeExistingListingGroupFilters,
  validateAndNormalizeListingGroupNodes
} from '~~/server/utils/googleAds/listingGroups'

const ResourceNameArgumentsSchema = z.strictObject({
  resourceName: z.string().trim().min(1).max(1_000),
  status: z.enum(['ENABLED', 'PAUSED']).optional()
})
const DestructiveResourceNameArgumentsSchema = z.strictObject({
  resourceName: z.string().trim().min(1).max(1_000),
  reason: z.string().trim().min(10).max(1_000)
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
const UpdateCampaignArgumentsSchema = z.strictObject({
  resourceName: z.string().trim().min(1).max(1_000),
  name: z.string().trim().min(1).max(255).optional(),
  budgetResourceName: z.string().trim().min(1).max(1_000).optional(),
  includeSearchPartners: z.boolean().optional(),
  startDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/).optional(),
  endDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/).optional()
}).superRefine((value, refinement) => {
  if (value.name === undefined && value.budgetResourceName === undefined
    && value.includeSearchPartners === undefined && value.startDateTime === undefined
    && value.endDateTime === undefined) {
    refinement.addIssue({ code: 'custom', message: 'At least one mutable campaign field is required' })
  }
})
const CreateAdGroupArgumentsSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  campaignResourceName: z.string().trim().min(1).max(1_000),
  cpcBid: z.number().finite().positive().max(1_000_000).optional()
})
const UpdateAdGroupArgumentsSchema = z.strictObject({
  resourceName: z.string().trim().min(1).max(1_000),
  name: z.string().trim().min(1).max(255).optional(),
  cpcBid: z.number().finite().positive().max(1_000_000).optional()
}).superRefine((value, refinement) => {
  if (value.name === undefined && value.cpcBid === undefined) {
    refinement.addIssue({ code: 'custom', message: 'At least one mutable ad-group field is required' })
  }
})
const PositiveKeywordArgumentsSchema = z.strictObject({
  adGroupResourceName: z.string().trim().min(1).max(1_000),
  keywords: z.array(NegativeKeywordSchema).min(1).max(100)
})
const UpdateKeywordArgumentsSchema = z.strictObject({
  resourceName: z.string().trim().min(1).max(1_000),
  cpcBid: z.number().finite().positive().max(1_000_000).optional(),
  finalUrl: z.string().url().refine(value => value.startsWith('https://')).optional()
}).superRefine((value, refinement) => {
  if (value.cpcBid === undefined && value.finalUrl === undefined) {
    refinement.addIssue({ code: 'custom', message: 'At least one mutable keyword field is required' })
  }
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
const CustomAudienceMemberTypeSchema = z.enum(['KEYWORD', 'URL', 'APP', 'PLACE_CATEGORY'])
const CustomAudienceMemberSchema = z.strictObject({
  type: CustomAudienceMemberTypeSchema,
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
const CreateCustomAudienceArgumentsSchema = z.strictObject({
  action: z.literal('create'),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10_000).default(''),
  type: z.enum(['AUTO', 'SEARCH']),
  members: CustomAudienceMembersSchema
})
const UpdateCustomAudienceArgumentsSchema = z.strictObject({
  action: z.literal('update'),
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
const ManageCustomAudienceArgumentsSchema = z.union([
  CreateCustomAudienceArgumentsSchema,
  UpdateCustomAudienceArgumentsSchema
])
const SetPmaxSignalsArgumentsSchema = z.strictObject({
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
const SetSearchThemesArgumentsSchema = z.strictObject({
  assetGroupResourceName: z.string().trim().min(1).max(1_000),
  themes: z.array(SearchThemeTextSchema).max(25)
}).superRefine((value, refinement) => {
  const keys = value.themes.map(theme => theme.replace(/\s+/g, ' ').toLocaleLowerCase('en-AU'))
  if (new Set(keys).size !== keys.length) {
    refinement.addIssue({ code: 'custom', message: 'Search themes must be unique' })
  }
})
const AssetNameSchema = z.string().trim().min(1).max(255).optional()
const HttpsAssetUrlSchema = z.string().url().refine(value => value.startsWith('https://'), {
  message: 'Asset final URLs must use HTTPS'
})
const StructuredSnippetHeaderSchema = z.enum([
  'Brands', 'Amenities', 'Styles', 'Types', 'Destinations', 'Services', 'Courses',
  'Neighbourhoods', 'Shows', 'Insurance coverage', 'Degree programmes', 'Featured hotels', 'Models'
])
const CreateAssetArgumentsSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('CALL'),
    name: AssetNameSchema,
    countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/),
    phoneNumber: z.string().trim().min(3).max(30)
  }),
  z.strictObject({
    type: z.literal('SITELINK'),
    name: AssetNameSchema,
    linkText: z.string().trim().min(1).max(25),
    description1: z.string().trim().min(1).max(35).optional(),
    description2: z.string().trim().min(1).max(35).optional(),
    finalUrl: HttpsAssetUrlSchema,
    finalMobileUrl: HttpsAssetUrlSchema.optional()
  }),
  z.strictObject({
    type: z.literal('CALLOUT'),
    name: AssetNameSchema,
    calloutText: z.string().trim().min(1).max(25)
  }),
  z.strictObject({
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
const AttachAssetArgumentsSchema = z.strictObject({
  scope: AssetLinkScopeSchema,
  parentResourceName: z.string().trim().min(1).max(1_000),
  assetResourceName: z.string().trim().min(1).max(1_000),
  fieldType: AssetExtensionFieldTypeSchema
})
const AssetLinkDispositionArgumentsSchema = z.strictObject({
  scope: AssetLinkScopeSchema,
  resourceName: z.string().trim().min(1).max(1_000)
})
const PmaxAssetFieldTypeSchema = z.enum([
  'HEADLINE', 'LONG_HEADLINE', 'DESCRIPTION', 'MARKETING_IMAGE',
  'SQUARE_MARKETING_IMAGE', 'BUSINESS_NAME', 'LOGO', 'PORTRAIT_MARKETING_IMAGE',
  'LANDSCAPE_LOGO', 'YOUTUBE_VIDEO', 'CALL_TO_ACTION_SELECTION', 'MEDIA_BUNDLE'
])
const PmaxAssetLinkSchema = z.strictObject({
  fieldType: PmaxAssetFieldTypeSchema,
  assetResourceName: z.string().trim().min(1).max(1_000)
})
const CreateAssetGroupArgumentsSchema = z.strictObject({
  campaignResourceName: z.string().trim().min(1).max(1_000),
  name: z.string().trim().min(1).max(128),
  finalUrls: z.array(HttpsAssetUrlSchema).min(1).max(10),
  finalMobileUrls: z.array(HttpsAssetUrlSchema).max(10).default([]),
  path1: z.string().trim().min(1).max(15).optional(),
  path2: z.string().trim().min(1).max(15).optional(),
  assets: z.array(PmaxAssetLinkSchema).max(128)
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
const UpdateAssetGroupArgumentsSchema = z.strictObject({
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
const SetAssetGroupAssetsArgumentsSchema = z.strictObject({
  assetGroupResourceName: z.string().trim().min(1).max(1_000),
  assets: z.array(PmaxAssetLinkSchema).max(128)
}).superRefine((value, refinement) => {
  const keys = value.assets.map(asset => `${asset.fieldType}:${asset.assetResourceName}`)
  if (new Set(keys).size !== keys.length) {
    refinement.addIssue({ code: 'custom', message: 'Asset-group links must be unique' })
  }
})
const SetListingGroupsArgumentsSchema = z.strictObject({
  assetGroupResourceName: z.string().trim().min(1).max(1_000),
  nodes: ListingGroupNodesInputSchema
})
const RecommendationArgumentsSchema = z.strictObject({
  resourceName: z.string().trim().min(1).max(1_000)
})
const PmaxAssetStateSchema = z.object({
  resourceName: z.string(),
  type: z.enum(['TEXT', 'IMAGE', 'YOUTUBE_VIDEO', 'CALL_TO_ACTION', 'MEDIA_BUNDLE']),
  text: z.string().optional(),
  fileSize: z.string().optional(),
  widthPixels: z.string().optional(),
  heightPixels: z.string().optional()
})
const CreateAssetGroupCurrentStateSchema = z.object({
  campaign: z.object({
    resourceName: z.string(),
    advertisingChannelType: z.string(),
    brandGuidelinesEnabled: z.boolean(),
    merchantId: z.string().nullable()
  }),
  nameAvailable: z.boolean(),
  assets: z.array(PmaxAssetStateSchema)
})
const MutableAssetGroupStateSchema = z.object({
  resourceName: z.string(),
  campaign: z.string(),
  name: z.string(),
  finalUrls: z.array(z.string()),
  finalMobileUrls: z.array(z.string()),
  path1: z.string().optional(),
  path2: z.string().optional(),
  status: z.enum(['ENABLED', 'PAUSED', 'REMOVED']),
  assets: z.array(PmaxAssetLinkSchema)
})
const AssetGroupMembershipCurrentStateSchema = z.object({
  assetGroup: z.object({
    resourceName: z.string(),
    campaign: z.string(),
    status: z.enum(['ENABLED', 'PAUSED', 'REMOVED']),
    assets: z.array(PmaxAssetLinkSchema)
  }),
  campaign: z.object({
    brandGuidelinesEnabled: z.boolean(),
    merchantId: z.string().nullable()
  }),
  assets: z.array(PmaxAssetStateSchema)
})
const ListingGroupCurrentStateSchema = z.object({
  assetGroup: z.object({
    resourceName: z.string(),
    campaign: z.string(),
    status: z.enum(['ENABLED', 'PAUSED', 'REMOVED'])
  }),
  campaign: z.object({
    advertisingChannelType: z.string(),
    merchantId: z.string().nullable()
  }),
  filters: z.array(ExistingListingGroupFilterSchema)
})
const RecommendationStateSchema = z.object({
  resourceName: z.string(),
  type: z.string().min(1),
  dismissed: z.boolean(),
  campaign: z.string().optional(),
  campaigns: z.array(z.string()),
  adGroup: z.string().optional(),
  campaignBudget: z.string().optional(),
  recommendedBudgetAmountMicros: z.string().optional()
})
const AssetLinkStateSchema = z.object({
  resourceName: z.string(),
  scope: AssetLinkScopeSchema,
  parentResourceName: z.string(),
  assetResourceName: z.string(),
  fieldType: AssetExtensionFieldTypeSchema,
  assetType: AssetExtensionFieldTypeSchema.optional(),
  status: z.enum(['ABSENT', 'ENABLED', 'PAUSED', 'REMOVED'])
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
const SetCampaignGoalConfigArgumentsSchema = z.strictObject({
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
const CreateCustomConversionGoalArgumentsSchema = z.strictObject({
  name: z.string().trim().min(1).max(255),
  conversionActionResourceNames: z.array(z.string().trim().min(1).max(1_000)).min(1).max(100)
}).superRefine((value, refinement) => {
  if (new Set(value.conversionActionResourceNames).size !== value.conversionActionResourceNames.length) {
    refinement.addIssue({ code: 'custom', message: 'Custom conversion-goal actions must be unique' })
  }
})
const UpdateCustomConversionGoalArgumentsSchema = z.strictObject({
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
const MutableCustomConversionGoalStateSchema = z.object({
  resourceName: z.string(),
  name: z.string(),
  status: z.enum(['ENABLED', 'REMOVED']),
  conversionActions: z.array(z.string())
})
const CampaignGoalConfigStateSchema = z.object({
  resourceName: z.string(),
  campaignResourceName: z.string(),
  goalConfigLevel: z.enum(['CUSTOMER', 'CAMPAIGN']),
  customConversionGoal: z.string().optional()
})
const MutableCustomAudienceStateSchema = z.object({
  resourceName: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(['ENABLED', 'REMOVED']),
  type: z.enum(['AUTO', 'SEARCH', 'INTEREST', 'PURCHASE_INTENT']),
  members: z.array(CustomAudienceMemberSchema)
})
const PmaxAudienceSignalStateSchema = z.object({
  assetGroupResourceName: z.string(),
  audienceSignals: z.array(z.object({
    resourceName: z.string().optional(),
    audienceResourceName: z.string()
  }))
})
const PmaxSearchThemeStateSchema = z.object({
  assetGroupResourceName: z.string(),
  searchThemes: z.array(z.object({
    resourceName: z.string().optional(),
    text: z.string()
  }))
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

const REMOVE_OPERATIONS = {
  remove_campaign: { resourceType: 'campaign', segment: 'campaigns', service: 'campaigns' },
  remove_ad_group: { resourceType: 'ad_group', segment: 'adGroups', service: 'adGroups' },
  remove_ad: { resourceType: 'ad', segment: 'adGroupAds', service: 'adGroupAds' },
  remove_keyword: { resourceType: 'keyword', segment: 'adGroupCriteria', service: 'adGroupCriteria' }
} as const

type StatusOperation = keyof typeof STATUS_OPERATIONS
type RemoveOperation = keyof typeof REMOVE_OPERATIONS

function isStatusOperation(operation: GoogleAdsOperationType): operation is StatusOperation {
  return Object.hasOwn(STATUS_OPERATIONS, operation)
}

function isRemoveOperation(operation: GoogleAdsOperationType): operation is RemoveOperation {
  return Object.hasOwn(REMOVE_OPERATIONS, operation)
}

export function isSearchGoogleAdsOperation(operation: GoogleAdsOperationType): boolean {
  return isStatusOperation(operation)
    || isRemoveOperation(operation)
    || [
      'add_negative_keywords',
      'create_budget',
      'update_budget',
      'create_campaign',
      'update_campaign',
      'create_ad_group',
      'update_ad_group',
      'create_ad',
      'add_keywords',
      'update_keyword',
      'set_locations',
      'set_location_match_mode',
      'set_languages',
      'set_ad_schedule',
      'set_devices',
      'set_demographics',
      'set_placements',
      'set_content_exclusions',
      'set_audience_associations',
      'manage_custom_audience',
      'archive_custom_audience',
      'set_pmax_signals',
      'set_search_themes',
      'create_asset',
      'attach_asset',
      'archive_asset_link',
      'detach_asset',
      'create_asset_group',
      'update_asset_group',
      'manage_asset_group_assets',
      'manage_listing_groups',
      'apply_recommendation',
      'dismiss_recommendation',
      'set_campaign_conversion_goals',
      'set_conversion_goal',
      'set_customer_goal_biddability',
      'set_conversion_primary_state',
      'create_conversion_action',
      'update_conversion_action',
      'archive_conversion_action',
      'remove_conversion_action',
      'create_custom_conversion_goal',
      'update_custom_conversion_goal',
      'archive_custom_conversion_goal'
    ].includes(operation)
}

function resourcePattern(customerId: string, segment: string): RegExp {
  const suffix = segment === 'adGroupAds'
    || segment === 'adGroupCriteria'
    || segment === 'campaignCriteria'
    || segment === 'assetGroupSignals'
    ? '\\d+~\\d+'
    : segment === 'recommendations' ? '[A-Za-z0-9_-]+' : '\\d+'
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
  if (isRemoveOperation(operation)) return DestructiveResourceNameArgumentsSchema.parse(argumentsValue)
  if (operation === 'add_negative_keywords') return NegativeKeywordArgumentsSchema.parse(argumentsValue)
  if (operation === 'create_budget') return CreateBudgetArgumentsSchema.parse(argumentsValue)
  if (operation === 'update_budget') return UpdateBudgetArgumentsSchema.parse(argumentsValue)
  if (operation === 'create_campaign') return CreateCampaignArgumentsSchema.parse(argumentsValue)
  if (operation === 'update_campaign') return UpdateCampaignArgumentsSchema.parse(argumentsValue)
  if (operation === 'create_ad_group') return CreateAdGroupArgumentsSchema.parse(argumentsValue)
  if (operation === 'update_ad_group') return UpdateAdGroupArgumentsSchema.parse(argumentsValue)
  if (operation === 'create_ad') return CreateResponsiveSearchAdArgumentsSchema.parse(argumentsValue)
  if (operation === 'add_keywords') return PositiveKeywordArgumentsSchema.parse(argumentsValue)
  if (operation === 'update_keyword') return UpdateKeywordArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_locations') return SetLocationsArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_location_match_mode') return SetLocationMatchModeArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_languages') return SetLanguagesArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_ad_schedule') return SetAdScheduleArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_devices') return SetDevicesArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_demographics') return SetDemographicsArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_placements') return SetPlacementsArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_content_exclusions') return SetContentExclusionsArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_audience_associations') return SetAudienceAssociationsArgumentsSchema.parse(argumentsValue)
  if (operation === 'manage_custom_audience') return ManageCustomAudienceArgumentsSchema.parse(argumentsValue)
  if (operation === 'archive_custom_audience') {
    return DestructiveResourceNameArgumentsSchema.parse(argumentsValue)
  }
  if (operation === 'set_pmax_signals') return SetPmaxSignalsArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_search_themes') return SetSearchThemesArgumentsSchema.parse(argumentsValue)
  if (operation === 'create_asset') return CreateAssetArgumentsSchema.parse(argumentsValue)
  if (operation === 'attach_asset') return AttachAssetArgumentsSchema.parse(argumentsValue)
  if (operation === 'archive_asset_link' || operation === 'detach_asset') {
    return AssetLinkDispositionArgumentsSchema.parse(argumentsValue)
  }
  if (operation === 'create_asset_group') return CreateAssetGroupArgumentsSchema.parse(argumentsValue)
  if (operation === 'update_asset_group') return UpdateAssetGroupArgumentsSchema.parse(argumentsValue)
  if (operation === 'manage_asset_group_assets') return SetAssetGroupAssetsArgumentsSchema.parse(argumentsValue)
  if (operation === 'manage_listing_groups') return SetListingGroupsArgumentsSchema.parse(argumentsValue)
  if (operation === 'apply_recommendation' || operation === 'dismiss_recommendation') {
    return RecommendationArgumentsSchema.parse(argumentsValue)
  }
  if (operation === 'set_campaign_conversion_goals') return SetCampaignConversionGoalsArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_conversion_goal') return SetCampaignGoalConfigArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_customer_goal_biddability') return SetCustomerGoalBiddabilityArgumentsSchema.parse(argumentsValue)
  if (operation === 'set_conversion_primary_state') return SetConversionPrimaryStateArgumentsSchema.parse(argumentsValue)
  if (operation === 'create_conversion_action') return CreateConversionActionArgumentsSchema.parse(argumentsValue)
  if (operation === 'update_conversion_action') return UpdateConversionActionArgumentsSchema.parse(argumentsValue)
  if (operation === 'archive_conversion_action') return ResourceNameArgumentsSchema.parse(argumentsValue)
  if (operation === 'remove_conversion_action') {
    return DestructiveResourceNameArgumentsSchema.parse(argumentsValue)
  }
  if (operation === 'create_custom_conversion_goal') {
    return CreateCustomConversionGoalArgumentsSchema.parse(argumentsValue)
  }
  if (operation === 'update_custom_conversion_goal') {
    return UpdateCustomConversionGoalArgumentsSchema.parse(argumentsValue)
  }
  if (operation === 'archive_custom_conversion_goal') {
    return DestructiveResourceNameArgumentsSchema.parse(argumentsValue)
  }
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

function buildRemoveAction(context: BuildGoogleAdsActionContext, operation: RemoveOperation): BuiltGoogleAdsAction {
  const config = REMOVE_OPERATIONS[operation]
  if (context.input.resourceType !== config.resourceType) {
    throw new Error(`Operation ${operation} requires resource type ${config.resourceType}`)
  }
  const args = DestructiveResourceNameArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, config.segment)

  return {
    resourceName: args.resourceName,
    desiredState: { resourceName: args.resourceName, status: 'REMOVED' },
    providerOperations: [{
      service: config.service,
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ remove: args.resourceName }]
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

function buildUpdateCampaignAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'campaign') throw new Error('Campaign update requires resource type campaign')
  const args = UpdateCampaignArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, 'campaigns')
  if (args.budgetResourceName) assertResourceName(args.budgetResourceName, context.customerId, 'campaignBudgets')
  const current = z.object({
    resourceName: z.literal(args.resourceName),
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
  }).parse(context.currentState)
  const update: Record<string, unknown> = { resourceName: args.resourceName }
  const mask: string[] = []
  const desired = { ...current, networkSettings: { ...current.networkSettings } }
  if (args.name !== undefined && args.name !== current.name) {
    update.name = args.name
    desired.name = args.name
    mask.push('name')
  }
  if (args.budgetResourceName !== undefined && args.budgetResourceName !== current.campaignBudget) {
    update.campaignBudget = args.budgetResourceName
    desired.campaignBudget = args.budgetResourceName
    mask.push('campaign_budget')
  }
  if (args.includeSearchPartners !== undefined
    && args.includeSearchPartners !== current.networkSettings.targetPartnerSearchNetwork) {
    update.networkSettings = { targetPartnerSearchNetwork: args.includeSearchPartners }
    desired.networkSettings.targetPartnerSearchNetwork = args.includeSearchPartners
    mask.push('network_settings.target_partner_search_network')
  }
  if (args.startDateTime !== undefined && args.startDateTime !== current.startDateTime) {
    update.startDateTime = args.startDateTime
    desired.startDateTime = args.startDateTime
    mask.push('start_date_time')
  }
  if (args.endDateTime !== undefined && args.endDateTime !== current.endDateTime) {
    update.endDateTime = args.endDateTime
    desired.endDateTime = args.endDateTime
    mask.push('end_date_time')
  }
  if (mask.length === 0) throw new Error('The campaign already matches the requested mutable fields')
  return {
    resourceName: args.resourceName,
    desiredState: desired,
    providerOperations: [{
      service: 'campaigns',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ update, updateMask: mask.join(',') }]
    }]
  }
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

function buildUpdateAdGroupAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'ad_group') throw new Error('Ad-group update requires resource type ad_group')
  const args = UpdateAdGroupArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, 'adGroups')
  const current = z.object({
    resourceName: z.literal(args.resourceName),
    name: z.string(),
    campaign: z.string(),
    type: z.string(),
    status: z.string(),
    cpcBidMicros: z.string().optional()
  }).parse(context.currentState)
  const update: Record<string, unknown> = { resourceName: args.resourceName }
  const mask: string[] = []
  const desired = { ...current }
  if (args.name !== undefined && args.name !== current.name) {
    update.name = args.name
    desired.name = args.name
    mask.push('name')
  }
  const cpcBidMicros = args.cpcBid === undefined ? undefined : amountMicros(args.cpcBid)
  if (cpcBidMicros !== undefined && cpcBidMicros !== current.cpcBidMicros) {
    update.cpcBidMicros = cpcBidMicros
    desired.cpcBidMicros = cpcBidMicros
    mask.push('cpc_bid_micros')
  }
  if (mask.length === 0) throw new Error('The ad group already matches the requested mutable fields')
  return {
    resourceName: args.resourceName,
    desiredState: desired,
    providerOperations: [{
      service: 'adGroups',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ update, updateMask: mask.join(',') }]
    }]
  }
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

function buildUpdateKeywordAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'keyword') throw new Error('Keyword update requires resource type keyword')
  const args = UpdateKeywordArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, 'adGroupCriteria')
  const current = z.object({
    resourceName: z.literal(args.resourceName),
    adGroup: z.string(),
    status: z.string(),
    negative: z.literal(false),
    keyword: z.object({ text: z.string(), matchType: z.enum(['EXACT', 'PHRASE', 'BROAD']) }),
    cpcBidMicros: z.string().optional(),
    finalUrls: z.array(z.string()).default([])
  }).parse(context.currentState)
  const update: Record<string, unknown> = { resourceName: args.resourceName }
  const mask: string[] = []
  const desired = { ...current }
  const cpcBidMicros = args.cpcBid === undefined ? undefined : amountMicros(args.cpcBid)
  if (cpcBidMicros !== undefined && cpcBidMicros !== current.cpcBidMicros) {
    update.cpcBidMicros = cpcBidMicros
    desired.cpcBidMicros = cpcBidMicros
    mask.push('cpc_bid_micros')
  }
  if (args.finalUrl !== undefined && (current.finalUrls.length !== 1 || current.finalUrls[0] !== args.finalUrl)) {
    update.finalUrls = [args.finalUrl]
    desired.finalUrls = [args.finalUrl]
    mask.push('final_urls')
  }
  if (mask.length === 0) throw new Error('The keyword already matches the requested mutable fields')
  return {
    resourceName: args.resourceName,
    desiredState: desired,
    providerOperations: [{
      service: 'adGroupCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ update, updateMask: mask.join(',') }]
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
  const operations: Array<{ update: Record<string, unknown>, updateMask: string }> = []
  for (const goal of args.goals) {
    const existing = currentByKey.get(key(goal))
    if (!existing?.resourceName) {
      // Google creates campaign conversion goals; v25 exposes update only.
      // https://developers.google.com/google-ads/api/docs/conversions/goals/overview#goal_management_overview
      throw new Error(`Campaign conversion goal was not found for ${goal.category}:${goal.origin}`)
    }
    const campaignId = args.campaignResourceName.slice(args.campaignResourceName.lastIndexOf('/') + 1)
    const expected = `customers/${context.customerId}/campaignConversionGoals/${campaignId}~${goal.category}~${goal.origin}`
    if (existing.resourceName !== expected) throw new Error('Campaign conversion goal does not belong to the selected campaign')
    if (existing.biddable !== goal.biddable) {
      operations.push({ update: { resourceName: existing.resourceName, biddable: goal.biddable }, updateMask: 'biddable' })
    }
  }
  if (operations.length === 0) throw new Error('Campaign conversion goals already match the requested values')
  const desiredGoals = [
    ...current.goals.map(goal => requested.has(key(goal)) ? { ...goal, biddable: requested.get(key(goal))!.biddable } : goal)
  ].sort((left, right) => key(left).localeCompare(key(right)))
  return {
    resourceName: args.campaignResourceName,
    desiredState: { campaignResourceName: args.campaignResourceName, goals: desiredGoals },
    providerOperations: [{ service: 'campaignConversionGoals', atomicity: 'interdependent', partialFailure: false, operations }]
  }
}

function buildCampaignGoalConfigAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'conversion_goal') {
    throw new Error('Campaign goal configuration requires resource type conversion_goal')
  }
  const args = SetCampaignGoalConfigArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.campaignResourceName, context.customerId, 'campaigns')
  const current = CampaignGoalConfigStateSchema.parse(context.currentState)
  const campaignId = args.campaignResourceName.slice(args.campaignResourceName.lastIndexOf('/') + 1)
  const resourceName = `customers/${context.customerId}/conversionGoalCampaignConfigs/${campaignId}`
  if (current.resourceName !== resourceName || current.campaignResourceName !== args.campaignResourceName) {
    throw new Error('Campaign goal configuration does not match the selected campaign')
  }
  const update: Record<string, unknown> = { resourceName }
  const targetLevel = args.mode === 'CUSTOMER_DEFAULTS' ? 'CUSTOMER' : 'CAMPAIGN'
  const targetCustomGoal = args.mode === 'CUSTOM_GOAL' ? args.customConversionGoalResourceName! : ''
  const desiredState: Record<string, unknown> = {
    resourceName,
    campaignResourceName: args.campaignResourceName,
    goalConfigLevel: targetLevel,
    customConversionGoal: targetCustomGoal
  }
  const masks: string[] = []
  if (current.goalConfigLevel !== targetLevel) {
    update.goalConfigLevel = targetLevel
    masks.push('goal_config_level')
  }
  if (args.mode === 'CAMPAIGN_GOALS') {
    if (current.customConversionGoal) {
      update.customConversionGoal = ''
      masks.push('custom_conversion_goal')
    }
  } else if (args.mode === 'CUSTOM_GOAL') {
    const customGoal = args.customConversionGoalResourceName!
    assertResourceName(customGoal, context.customerId, 'customConversionGoals')
    if (current.customConversionGoal !== customGoal) {
      update.customConversionGoal = customGoal
      masks.push('custom_conversion_goal')
    }
  }
  if (masks.length === 0) throw new Error('Campaign goal configuration already matches the requested mode')
  // v25 goal configs are provider-created and updated through exact field masks.
  // https://developers.google.com/google-ads/api/reference/rpc/v25/ConversionGoalCampaignConfigOperation
  return {
    resourceName,
    desiredState,
    providerOperations: [{
      service: 'conversionGoalCampaignConfigs',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ update, updateMask: masks.join(',') }]
    }]
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

function buildConversionActionDisposition(
  context: BuildGoogleAdsActionContext,
  disposition: 'archive' | 'remove'
): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'conversion_action') {
    throw new Error('Conversion action disposition requires resource type conversion_action')
  }
  const args = disposition === 'remove'
    ? DestructiveResourceNameArgumentsSchema.parse(context.input.arguments)
    : ResourceNameArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, 'conversionActions')
  const current = MutableConversionActionStateSchema.parse(context.currentState)
  if (current.resourceName !== args.resourceName) {
    throw new Error('Conversion action state does not match the selected resource')
  }
  if (disposition === 'archive') {
    if (current.status === 'HIDDEN') throw new Error('Conversion action is already archived')
    if (current.status === 'REMOVED') throw new Error('A removed conversion action cannot be archived')
    // HIDDEN is the safe, reversible-by-update default; remove is exposed separately.
    // https://developers.google.com/google-ads/api/reference/rpc/v25/ConversionActionStatusEnum.ConversionActionStatus
    return {
      resourceName: args.resourceName,
      desiredState: { resourceName: args.resourceName, status: 'HIDDEN' },
      providerOperations: [{
        service: 'conversionActions',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{
          update: { resourceName: args.resourceName, status: 'HIDDEN' },
          updateMask: 'status'
        }]
      }]
    }
  }
  if (current.status === 'REMOVED') throw new Error('Conversion action is already removed')
  // v25 supports provider removal, but policy requires owner/admin destructive confirmation.
  // https://developers.google.com/google-ads/api/reference/rpc/v25/ConversionActionOperation
  return {
    resourceName: args.resourceName,
    desiredState: { resourceName: args.resourceName, status: 'REMOVED' },
    providerOperations: [{
      service: 'conversionActions',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ remove: args.resourceName }]
    }]
  }
}

function buildCreateCustomConversionGoal(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'custom_conversion_goal') {
    throw new Error('Custom conversion-goal creation requires resource type custom_conversion_goal')
  }
  const args = CreateCustomConversionGoalArgumentsSchema.parse(context.input.arguments)
  z.object({ exists: z.literal(false) }).parse(context.currentState)
  const conversionActions = [...args.conversionActionResourceNames]
    .sort((left, right) => left.localeCompare(right))
  for (const resourceName of conversionActions) {
    assertResourceName(resourceName, context.customerId, 'conversionActions')
  }
  // v25 custom goals are created in the conversion customer with a typed action list.
  // https://developers.google.com/google-ads/api/reference/rpc/v25/CustomConversionGoal
  const desiredState = {
    name: args.name,
    status: 'ENABLED',
    conversionActions
  }
  return {
    resourceName: null,
    desiredState,
    providerOperations: [{
      service: 'customConversionGoals',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ create: desiredState }]
    }]
  }
}

function buildUpdateCustomConversionGoal(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'custom_conversion_goal') {
    throw new Error('Custom conversion-goal updates require resource type custom_conversion_goal')
  }
  const args = UpdateCustomConversionGoalArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, 'customConversionGoals')
  const current = MutableCustomConversionGoalStateSchema.parse(context.currentState)
  if (current.resourceName !== args.resourceName) {
    throw new Error('Custom conversion-goal state does not match the selected resource')
  }
  if (current.status === 'REMOVED') throw new Error('A removed custom conversion goal cannot be updated')
  const update: Record<string, unknown> = { resourceName: args.resourceName }
  const desiredState: Record<string, unknown> = { resourceName: args.resourceName }
  const masks: string[] = []
  if (args.name !== undefined && args.name !== current.name) {
    update.name = args.name
    desiredState.name = args.name
    masks.push('name')
  }
  if (args.conversionActionResourceNames) {
    const conversionActions = [...args.conversionActionResourceNames]
      .sort((left, right) => left.localeCompare(right))
    for (const resourceName of conversionActions) {
      assertResourceName(resourceName, context.customerId, 'conversionActions')
    }
    const currentActions = [...current.conversionActions].sort((left, right) => left.localeCompare(right))
    if (JSON.stringify(conversionActions) !== JSON.stringify(currentActions)) {
      update.conversionActions = conversionActions
      desiredState.conversionActions = conversionActions
      masks.push('conversion_actions')
    }
  }
  if (masks.length === 0) throw new Error('Custom conversion goal already matches the requested values')
  return {
    resourceName: args.resourceName,
    desiredState,
    providerOperations: [{
      service: 'customConversionGoals',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ update, updateMask: masks.join(',') }]
    }]
  }
}

function buildArchiveCustomConversionGoal(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'custom_conversion_goal') {
    throw new Error('Custom conversion-goal archive requires resource type custom_conversion_goal')
  }
  const args = DestructiveResourceNameArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, 'customConversionGoals')
  const current = MutableCustomConversionGoalStateSchema.parse(context.currentState)
  if (current.resourceName !== args.resourceName) {
    throw new Error('Custom conversion-goal state does not match the selected resource')
  }
  if (current.status === 'REMOVED') throw new Error('Custom conversion goal is already archived')
  // v25 has only ENABLED/REMOVED custom-goal states; archive therefore uses provider removal.
  // https://developers.google.com/google-ads/api/reference/rpc/v25/CustomConversionGoalStatusEnum.CustomConversionGoalStatus
  return {
    resourceName: args.resourceName,
    desiredState: { resourceName: args.resourceName, status: 'REMOVED' },
    providerOperations: [{
      service: 'customConversionGoals',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ remove: args.resourceName }]
    }]
  }
}

function normalizeCustomAudienceMembers(
  members: z.infer<typeof CustomAudienceMembersSchema>
): z.infer<typeof CustomAudienceMembersSchema> {
  return [...members].sort((left, right) => {
    const typeOrder = left.type.localeCompare(right.type, 'en-AU')
    return typeOrder || left.value.localeCompare(right.value, 'en-AU')
  })
}

function customAudienceProviderMembers(members: z.infer<typeof CustomAudienceMembersSchema>) {
  return normalizeCustomAudienceMembers(members).map((member) => {
    if (member.type === 'KEYWORD') return { memberType: member.type, keyword: member.value }
    if (member.type === 'URL') return { memberType: member.type, url: member.value }
    if (member.type === 'APP') return { memberType: member.type, app: member.value }
    return { memberType: member.type, placeCategory: member.value }
  })
}

function buildManageCustomAudienceAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'custom_audience') {
    throw new Error('Custom-audience management requires resource type custom_audience')
  }
  const args = ManageCustomAudienceArgumentsSchema.parse(context.input.arguments)
  if (args.action === 'create') {
    z.object({ exists: z.literal(false) }).parse(context.currentState)
    const members = normalizeCustomAudienceMembers(args.members)
    const create = {
      name: args.name,
      description: args.description,
      type: args.type,
      members: customAudienceProviderMembers(members)
    }
    return {
      resourceName: null,
      desiredState: { ...create, status: 'ENABLED', members },
      providerOperations: [{
        service: 'customAudiences',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ create }]
      }]
    }
  }

  assertResourceName(args.resourceName, context.customerId, 'customAudiences')
  const current = MutableCustomAudienceStateSchema.parse(context.currentState)
  if (current.resourceName !== args.resourceName) throw new Error('Custom-audience state does not match the selected resource')
  if (current.status === 'REMOVED') throw new Error('Removed custom audiences cannot be updated')
  const update: Record<string, unknown> = { resourceName: args.resourceName }
  const desiredState: Record<string, unknown> = { resourceName: args.resourceName }
  const masks: string[] = []
  const add = (field: string, value: unknown, currentValue: unknown) => {
    if (value === undefined || value === currentValue) return
    update[field] = value
    desiredState[field] = value
    masks.push(field)
  }
  add('name', args.name, current.name)
  add('description', args.description, current.description)
  add('type', args.type, current.type)
  if (args.members !== undefined) {
    const members = normalizeCustomAudienceMembers(args.members)
    const currentMembers = normalizeCustomAudienceMembers(current.members)
    if (JSON.stringify(members) !== JSON.stringify(currentMembers)) {
      update.members = customAudienceProviderMembers(members)
      desiredState.members = members
      masks.push('members')
    }
  }
  if (masks.length === 0) throw new Error('Custom audience already matches the requested values')
  return {
    resourceName: args.resourceName,
    desiredState,
    providerOperations: [{
      service: 'customAudiences',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ update, updateMask: masks.join(',') }]
    }]
  }
}

function buildArchiveCustomAudienceAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'custom_audience') {
    throw new Error('Custom-audience archive requires resource type custom_audience')
  }
  const args = DestructiveResourceNameArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, 'customAudiences')
  const current = MutableCustomAudienceStateSchema.parse(context.currentState)
  if (current.resourceName !== args.resourceName) throw new Error('Custom-audience state does not match the selected resource')
  if (current.status === 'REMOVED') throw new Error('Custom audience is already archived')
  return {
    resourceName: args.resourceName,
    desiredState: { resourceName: args.resourceName, status: 'REMOVED' },
    providerOperations: [{
      service: 'customAudiences',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ remove: args.resourceName }]
    }]
  }
}

function buildPmaxAudienceSignalsAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'audience') {
    throw new Error('Performance Max audience signals require resource type audience')
  }
  const args = SetPmaxSignalsArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.assetGroupResourceName, context.customerId, 'assetGroups')
  for (const audienceResourceName of args.audienceResourceNames) {
    assertResourceName(audienceResourceName, context.customerId, 'audiences')
  }
  const current = PmaxAudienceSignalStateSchema.parse(context.currentState)
  if (current.assetGroupResourceName !== args.assetGroupResourceName) {
    throw new Error('Performance Max signal state does not match the selected asset group')
  }
  const desiredNames = [...args.audienceResourceNames].sort((left, right) => left.localeCompare(right))
  const desiredSet = new Set(desiredNames)
  const currentSet = new Set(current.audienceSignals.map(signal => signal.audienceResourceName))
  const operations: Array<{ create: Record<string, unknown> } | { remove: string }> = []
  for (const audienceResourceName of desiredNames) {
    if (!currentSet.has(audienceResourceName)) {
      operations.push({ create: {
        assetGroup: args.assetGroupResourceName,
        audience: { audience: audienceResourceName }
      } })
    }
  }
  for (const signal of current.audienceSignals) {
    if (desiredSet.has(signal.audienceResourceName)) continue
    if (!signal.resourceName) throw new Error('Existing Performance Max audience signal has no resource name')
    assertResourceName(signal.resourceName, context.customerId, 'assetGroupSignals')
    operations.push({ remove: signal.resourceName })
  }
  if (operations.length === 0) throw new Error('Performance Max audience signals already match the requested values')
  return {
    resourceName: args.assetGroupResourceName,
    desiredState: {
      assetGroupResourceName: args.assetGroupResourceName,
      audienceSignals: desiredNames.map(audienceResourceName => ({ audienceResourceName }))
    },
    providerOperations: [{
      service: 'assetGroupSignals',
      atomicity: 'interdependent',
      partialFailure: false,
      operations
    }]
  }
}

function normalizeSearchThemeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function searchThemeKey(value: string): string {
  return normalizeSearchThemeText(value).toLocaleLowerCase('en-AU')
}

function buildPmaxSearchThemesAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'search_theme') {
    throw new Error('Performance Max search themes require resource type search_theme')
  }
  const args = SetSearchThemesArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.assetGroupResourceName, context.customerId, 'assetGroups')
  const current = PmaxSearchThemeStateSchema.parse(context.currentState)
  if (current.assetGroupResourceName !== args.assetGroupResourceName) {
    throw new Error('Performance Max search-theme state does not match the selected asset group')
  }
  const themes = args.themes.map(normalizeSearchThemeText)
    .sort((left, right) => left.localeCompare(right, 'en-AU'))
  const desiredKeys = new Set(themes.map(searchThemeKey))
  const currentKeys = new Set(current.searchThemes.map(signal => searchThemeKey(signal.text)))
  const operations: Array<{ create: Record<string, unknown> } | { remove: string }> = []
  for (const text of themes) {
    if (!currentKeys.has(searchThemeKey(text))) {
      operations.push({ create: { assetGroup: args.assetGroupResourceName, searchTheme: { text } } })
    }
  }
  for (const signal of current.searchThemes) {
    if (desiredKeys.has(searchThemeKey(signal.text))) continue
    if (!signal.resourceName) throw new Error('Existing Performance Max search theme has no resource name')
    assertResourceName(signal.resourceName, context.customerId, 'assetGroupSignals')
    operations.push({ remove: signal.resourceName })
  }
  if (operations.length === 0) throw new Error('Search themes already match the requested values')
  return {
    resourceName: args.assetGroupResourceName,
    desiredState: {
      assetGroupResourceName: args.assetGroupResourceName,
      searchThemes: themes.map(text => ({ text }))
    },
    providerOperations: [{
      service: 'assetGroupSignals',
      atomicity: 'interdependent',
      partialFailure: false,
      operations
    }]
  }
}

function buildCreateAssetAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'asset') {
    throw new Error('Asset creation requires resource type asset')
  }
  const args = CreateAssetArgumentsSchema.parse(context.input.arguments)
  z.object({ exists: z.literal(false) }).parse(context.currentState)

  let create: Record<string, unknown>
  let desiredState: Record<string, unknown>
  if (args.type === 'CALL') {
    const callAsset = {
      countryCode: args.countryCode.toUpperCase(),
      phoneNumber: args.phoneNumber
    }
    create = { ...(args.name ? { name: args.name } : {}), callAsset }
    desiredState = { type: args.type, ...(args.name ? { name: args.name } : {}), callAsset }
  } else if (args.type === 'SITELINK') {
    const sitelinkAsset = {
      linkText: args.linkText,
      ...(args.description1 ? { description1: args.description1, description2: args.description2 } : {})
    }
    const finalUrls = [args.finalUrl]
    const finalMobileUrls = args.finalMobileUrl ? [args.finalMobileUrl] : []
    create = {
      ...(args.name ? { name: args.name } : {}),
      finalUrls,
      ...(finalMobileUrls.length > 0 ? { finalMobileUrls } : {}),
      sitelinkAsset
    }
    desiredState = {
      type: args.type,
      ...(args.name ? { name: args.name } : {}),
      finalUrls,
      finalMobileUrls,
      sitelinkAsset
    }
  } else if (args.type === 'CALLOUT') {
    const calloutAsset = { calloutText: args.calloutText }
    create = { ...(args.name ? { name: args.name } : {}), calloutAsset }
    desiredState = { type: args.type, ...(args.name ? { name: args.name } : {}), calloutAsset }
  } else {
    const structuredSnippetAsset = { header: args.header, values: args.values }
    create = { ...(args.name ? { name: args.name } : {}), structuredSnippetAsset }
    desiredState = {
      type: args.type,
      ...(args.name ? { name: args.name } : {}),
      structuredSnippetAsset
    }
  }

  // AssetService creates immutable assets. Serving is governed separately through link resources.
  // Source: https://developers.google.com/google-ads/api/docs/assets/working-with-assets#create_an_asset
  return {
    resourceName: null,
    desiredState,
    providerOperations: [{
      service: 'assets',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ create }]
    }]
  }
}

const ASSET_LINK_SCOPES = {
  customer: {
    service: 'customerAssets',
    segment: 'customerAssets',
    parentSegment: null,
    parentField: null
  },
  campaign: {
    service: 'campaignAssets',
    segment: 'campaignAssets',
    parentSegment: 'campaigns',
    parentField: 'campaign'
  },
  ad_group: {
    service: 'adGroupAssets',
    segment: 'adGroupAssets',
    parentSegment: 'adGroups',
    parentField: 'adGroup'
  }
} as const

type AssetLinkScope = keyof typeof ASSET_LINK_SCOPES

function numericResourceId(resourceName: string): string {
  const id = resourceName.slice(resourceName.lastIndexOf('/') + 1)
  if (!/^\d+$/.test(id)) throw new Error('Invalid Google Ads resource name')
  return id
}

function expectedAssetLinkResourceName(
  customerId: string,
  scope: AssetLinkScope,
  parentResourceName: string,
  assetResourceName: string,
  fieldType: z.infer<typeof AssetExtensionFieldTypeSchema>
): string {
  const config = ASSET_LINK_SCOPES[scope]
  const assetId = numericResourceId(assetResourceName)
  const leaf = scope === 'customer'
    ? `${assetId}~${fieldType}`
    : `${numericResourceId(parentResourceName)}~${assetId}~${fieldType}`
  return `customers/${customerId}/${config.segment}/${leaf}`
}

function assertAssetLinkResourceName(
  resourceName: string,
  customerId: string,
  scope: AssetLinkScope
): void {
  const segment = ASSET_LINK_SCOPES[scope].segment
  const leaf = scope === 'customer'
    ? '\\d+~(?:CALL|SITELINK|CALLOUT|STRUCTURED_SNIPPET)'
    : '\\d+~\\d+~(?:CALL|SITELINK|CALLOUT|STRUCTURED_SNIPPET)'
  if (!new RegExp(`^customers/${customerId}/${segment}/${leaf}$`).test(resourceName)) {
    throw new Error('Resource does not belong to the selected Google Ads customer')
  }
}

function buildAttachAssetAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'asset_link') {
    throw new Error('Asset attachment requires resource type asset_link')
  }
  const args = AttachAssetArgumentsSchema.parse(context.input.arguments)
  const config = ASSET_LINK_SCOPES[args.scope]
  assertResourceName(args.assetResourceName, context.customerId, 'assets')
  if (args.scope === 'customer') {
    if (args.parentResourceName !== `customers/${context.customerId}`) {
      throw new Error('Resource does not belong to the selected Google Ads customer')
    }
  } else {
    const parentSegment = args.scope === 'campaign' ? 'campaigns' : 'adGroups'
    assertResourceName(args.parentResourceName, context.customerId, parentSegment)
  }
  const resourceName = expectedAssetLinkResourceName(
    context.customerId, args.scope, args.parentResourceName, args.assetResourceName, args.fieldType
  )
  const current = AssetLinkStateSchema.parse(context.currentState)
  if (current.resourceName !== resourceName
    || current.scope !== args.scope
    || current.parentResourceName !== args.parentResourceName
    || current.assetResourceName !== args.assetResourceName
    || current.fieldType !== args.fieldType) {
    throw new Error('Asset-link state does not match the requested association')
  }
  if (current.assetType !== args.fieldType) {
    throw new Error('Asset type does not match the requested field type')
  }
  if (current.status === 'ENABLED') throw new Error('Asset is already attached and enabled')

  const desiredState = {
    resourceName,
    scope: args.scope,
    parentResourceName: args.parentResourceName,
    assetResourceName: args.assetResourceName,
    fieldType: args.fieldType,
    status: 'ENABLED' as const
  }
  const operation = current.status === 'PAUSED'
    ? { update: { resourceName, status: 'ENABLED' }, updateMask: 'status' }
    : {
        create: {
          ...(config.parentField ? { [config.parentField]: args.parentResourceName } : {}),
          asset: args.assetResourceName,
          fieldType: args.fieldType,
          status: 'ENABLED'
        }
      }
  return {
    resourceName,
    desiredState,
    providerOperations: [{
      service: config.service,
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [operation]
    }]
  }
}

function buildAssetLinkDispositionAction(
  context: BuildGoogleAdsActionContext,
  disposition: 'archive' | 'detach'
): BuiltGoogleAdsAction {
  // v25 link operations support status updates and removal independently of the immutable Asset.
  // Source: https://developers.google.com/google-ads/api/reference/rpc/v25/CustomerAssetOperation
  if (context.input.resourceType !== 'asset_link') {
    throw new Error('Asset-link disposition requires resource type asset_link')
  }
  const args = AssetLinkDispositionArgumentsSchema.parse(context.input.arguments)
  assertAssetLinkResourceName(args.resourceName, context.customerId, args.scope)
  const current = AssetLinkStateSchema.parse(context.currentState)
  if (current.resourceName !== args.resourceName || current.scope !== args.scope) {
    throw new Error('Asset-link state does not match the requested association')
  }
  if (current.status === 'ABSENT' || current.status === 'REMOVED') {
    throw new Error('Asset link is already detached')
  }
  if (disposition === 'archive' && current.status === 'PAUSED') {
    throw new Error('Asset link is already archived')
  }
  const status = disposition === 'archive' ? 'PAUSED' : 'REMOVED'
  const desiredState = {
    resourceName: current.resourceName,
    scope: current.scope,
    parentResourceName: current.parentResourceName,
    assetResourceName: current.assetResourceName,
    fieldType: current.fieldType,
    status
  }
  return {
    resourceName: args.resourceName,
    desiredState,
    providerOperations: [{
      service: ASSET_LINK_SCOPES[args.scope].service,
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [disposition === 'archive'
        ? { update: { resourceName: args.resourceName, status }, updateMask: 'status' }
        : { remove: args.resourceName }]
    }]
  }
}

const PMAX_ASSET_LIMITS: Record<z.infer<typeof PmaxAssetFieldTypeSchema>, {
  type: 'TEXT' | 'IMAGE' | 'YOUTUBE_VIDEO' | 'CALL_TO_ACTION' | 'MEDIA_BUNDLE'
  min: number
  max: number
  maxTextLength?: number
}> = {
  HEADLINE: { type: 'TEXT', min: 3, max: 15, maxTextLength: 30 },
  LONG_HEADLINE: { type: 'TEXT', min: 1, max: 5, maxTextLength: 90 },
  DESCRIPTION: { type: 'TEXT', min: 2, max: 5, maxTextLength: 90 },
  MARKETING_IMAGE: { type: 'IMAGE', min: 1, max: 20 },
  SQUARE_MARKETING_IMAGE: { type: 'IMAGE', min: 1, max: 20 },
  BUSINESS_NAME: { type: 'TEXT', min: 1, max: 1, maxTextLength: 25 },
  LOGO: { type: 'IMAGE', min: 1, max: 5 },
  PORTRAIT_MARKETING_IMAGE: { type: 'IMAGE', min: 0, max: 20 },
  LANDSCAPE_LOGO: { type: 'IMAGE', min: 0, max: 20 },
  YOUTUBE_VIDEO: { type: 'YOUTUBE_VIDEO', min: 0, max: 15 },
  CALL_TO_ACTION_SELECTION: { type: 'CALL_TO_ACTION', min: 0, max: 1 },
  MEDIA_BUNDLE: { type: 'MEDIA_BUNDLE', min: 0, max: 1 }
}

function sortPmaxAssetLinks(
  assets: z.infer<typeof PmaxAssetLinkSchema>[]
): z.infer<typeof PmaxAssetLinkSchema>[] {
  return [...assets].sort((left, right) => (
    left.fieldType.localeCompare(right.fieldType)
    || left.assetResourceName.localeCompare(right.assetResourceName)
  ))
}

function validatePmaxAssetBundle(
  links: z.infer<typeof PmaxAssetLinkSchema>[],
  libraryAssets: z.infer<typeof PmaxAssetStateSchema>[],
  campaign: { brandGuidelinesEnabled: boolean, merchantId?: string | null }
): z.infer<typeof PmaxAssetLinkSchema>[] {
  const assetsByResourceName = new Map(libraryAssets.map(asset => [asset.resourceName, asset]))
  for (const link of links) {
    const asset = assetsByResourceName.get(link.assetResourceName)
    if (!asset) throw new Error('A requested Performance Max asset was not found')
    const limit = PMAX_ASSET_LIMITS[link.fieldType]
    if (asset.type !== limit.type) throw new Error(`Asset type does not match ${link.fieldType}`)
    if (limit.maxTextLength !== undefined && asset.text !== undefined && asset.text.length > limit.maxTextLength) {
      throw new Error(`${link.fieldType} text exceeds ${limit.maxTextLength} characters`)
    }
  }
  const counts = Object.fromEntries(
    PmaxAssetFieldTypeSchema.options.map(fieldType => [
      fieldType, links.filter(asset => asset.fieldType === fieldType).length
    ])
  ) as Record<z.infer<typeof PmaxAssetFieldTypeSchema>, number>
  for (const fieldType of PmaxAssetFieldTypeSchema.options) {
    const { max } = PMAX_ASSET_LIMITS[fieldType]
    if (counts[fieldType] > max) throw new Error(`Asset groups permit at most ${max} ${fieldType} assets`)
  }
  const retailWithoutAssets = campaign.merchantId !== null && links.length === 0
  if (!retailWithoutAssets) {
    const required = ['HEADLINE', 'LONG_HEADLINE', 'DESCRIPTION', 'MARKETING_IMAGE', 'SQUARE_MARKETING_IMAGE'] as const
    const brandRequired = campaign.brandGuidelinesEnabled ? [] : ['BUSINESS_NAME', 'LOGO'] as const
    if (campaign.brandGuidelinesEnabled
      && (counts.BUSINESS_NAME > 0 || counts.LOGO > 0 || counts.LANDSCAPE_LOGO > 0)) {
      throw new Error('Brand-guideline campaigns require business name and logo assets at campaign level')
    }
    for (const fieldType of [...required, ...brandRequired]) {
      const { min } = PMAX_ASSET_LIMITS[fieldType]
      if (counts[fieldType] < min) {
        throw new Error(`Asset group requires at least ${min} ${fieldType} asset${min === 1 ? '' : 's'}`)
      }
    }
  }
  return sortPmaxAssetLinks(links)
}

function buildCreateAssetGroupAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'asset_group') {
    throw new Error('Asset-group creation requires resource type asset_group')
  }
  const args = CreateAssetGroupArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.campaignResourceName, context.customerId, 'campaigns')
  for (const link of args.assets) assertResourceName(link.assetResourceName, context.customerId, 'assets')
  const current = CreateAssetGroupCurrentStateSchema.parse(context.currentState)
  if (current.campaign.resourceName !== args.campaignResourceName) {
    throw new Error('Asset-group campaign state does not match the requested campaign')
  }
  if (current.campaign.advertisingChannelType !== 'PERFORMANCE_MAX') {
    throw new Error('Asset groups can only be created for Performance Max campaigns')
  }
  if (!current.nameAvailable) throw new Error('An asset group with this name already exists in the campaign')

  const assets = validatePmaxAssetBundle(args.assets, current.assets, current.campaign)
  const temporaryResourceName = `customers/${context.customerId}/assetGroups/-1`
  const create = {
    resourceName: temporaryResourceName,
    campaign: args.campaignResourceName,
    name: args.name,
    finalUrls: args.finalUrls,
    ...(args.finalMobileUrls.length > 0 ? { finalMobileUrls: args.finalMobileUrls } : {}),
    status: 'PAUSED',
    ...(args.path1 ? { path1: args.path1 } : {}),
    ...(args.path2 ? { path2: args.path2 } : {})
  }
  // Standard PMax groups and their minimum links must share one atomic GoogleAdsService.Mutate request.
  // Source: https://developers.google.com/google-ads/api/performance-max/structure-requests
  return {
    resourceName: null,
    desiredState: {
      campaign: args.campaignResourceName,
      name: args.name,
      finalUrls: args.finalUrls,
      finalMobileUrls: args.finalMobileUrls,
      ...(args.path1 ? { path1: args.path1 } : {}),
      ...(args.path2 ? { path2: args.path2 } : {}),
      status: 'PAUSED',
      assets
    },
    providerOperations: [{
      service: 'googleAds',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        { mutate: { assetGroupOperation: { create } } },
        ...assets.map(link => ({ mutate: { assetGroupAssetOperation: { create: {
          assetGroup: temporaryResourceName,
          asset: link.assetResourceName,
          fieldType: link.fieldType
        } } } }))
      ]
    }]
  }
}

function equalStringArrays(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function buildUpdateAssetGroupAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'asset_group') {
    throw new Error('Asset-group updates require resource type asset_group')
  }
  const args = UpdateAssetGroupArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, 'assetGroups')
  const current = MutableAssetGroupStateSchema.parse(context.currentState)
  if (current.resourceName !== args.resourceName) {
    throw new Error('Asset-group state does not match the requested resource')
  }
  assertResourceName(current.campaign, context.customerId, 'campaigns')
  if (current.status === 'REMOVED') throw new Error('A removed asset group cannot be updated')

  const desiredName = args.name ?? current.name
  const desiredFinalUrls = args.finalUrls ?? current.finalUrls
  const desiredFinalMobileUrls = args.finalMobileUrls ?? current.finalMobileUrls
  const desiredPath1 = args.path1 === undefined ? current.path1 : args.path1 ?? undefined
  const desiredPath2 = args.path2 === undefined ? current.path2 : args.path2 ?? undefined
  const desiredStatus = args.status ?? current.status
  if (desiredPath2 !== undefined && desiredPath1 === undefined) {
    throw new Error('Asset-group path2 requires path1')
  }

  const update: Record<string, unknown> = { resourceName: args.resourceName }
  const updateMask: string[] = []
  if (desiredName !== current.name) {
    update.name = desiredName
    updateMask.push('name')
  }
  if (!equalStringArrays(desiredFinalUrls, current.finalUrls)) {
    update.finalUrls = desiredFinalUrls
    updateMask.push('final_urls')
  }
  if (!equalStringArrays(desiredFinalMobileUrls, current.finalMobileUrls)) {
    update.finalMobileUrls = desiredFinalMobileUrls
    updateMask.push('final_mobile_urls')
  }
  if (desiredPath1 !== current.path1) {
    if (desiredPath1 !== undefined) update.path1 = desiredPath1
    updateMask.push('path1')
  }
  if (desiredPath2 !== current.path2) {
    if (desiredPath2 !== undefined) update.path2 = desiredPath2
    updateMask.push('path2')
  }
  if (desiredStatus !== current.status) {
    update.status = desiredStatus
    updateMask.push('status')
  }
  if (updateMask.length === 0) throw new Error('Asset-group fields already match the requested values')

  return {
    resourceName: args.resourceName,
    desiredState: {
      resourceName: current.resourceName,
      campaign: current.campaign,
      name: desiredName,
      finalUrls: desiredFinalUrls,
      finalMobileUrls: desiredFinalMobileUrls,
      ...(desiredPath1 ? { path1: desiredPath1 } : {}),
      ...(desiredPath2 ? { path2: desiredPath2 } : {}),
      status: desiredStatus,
      assets: current.assets
    },
    providerOperations: [{
      service: 'assetGroups',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ update, updateMask: updateMask.join(',') }]
    }]
  }
}

function pmaxAssetLinkKey(link: z.infer<typeof PmaxAssetLinkSchema>): string {
  return `${link.fieldType}:${link.assetResourceName}`
}

function assetGroupAssetResourceName(
  customerId: string,
  assetGroupResourceName: string,
  link: z.infer<typeof PmaxAssetLinkSchema>
): string {
  return `customers/${customerId}/assetGroupAssets/${numericResourceId(assetGroupResourceName)}~${numericResourceId(link.assetResourceName)}~${link.fieldType}`
}

function buildAssetGroupMembershipAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'asset_group') {
    throw new Error('Asset-group membership requires resource type asset_group')
  }
  const args = SetAssetGroupAssetsArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.assetGroupResourceName, context.customerId, 'assetGroups')
  for (const link of args.assets) assertResourceName(link.assetResourceName, context.customerId, 'assets')
  const current = AssetGroupMembershipCurrentStateSchema.parse(context.currentState)
  if (current.assetGroup.resourceName !== args.assetGroupResourceName) {
    throw new Error('Asset-group membership state does not match the requested resource')
  }
  assertResourceName(current.assetGroup.campaign, context.customerId, 'campaigns')
  if (current.assetGroup.status === 'REMOVED') throw new Error('A removed asset group cannot be updated')

  const desiredAssets = validatePmaxAssetBundle(args.assets, current.assets, current.campaign)
  const currentAssets = sortPmaxAssetLinks(current.assetGroup.assets)
  const desiredKeys = new Set(desiredAssets.map(pmaxAssetLinkKey))
  const currentKeys = new Set(currentAssets.map(pmaxAssetLinkKey))
  const operations: Array<{ create: Record<string, unknown> } | { remove: string }> = []
  for (const link of desiredAssets) {
    if (currentKeys.has(pmaxAssetLinkKey(link))) continue
    operations.push({ create: {
      assetGroup: args.assetGroupResourceName,
      asset: link.assetResourceName,
      fieldType: link.fieldType
    } })
  }
  for (const link of currentAssets) {
    if (desiredKeys.has(pmaxAssetLinkKey(link))) continue
    operations.push({ remove: assetGroupAssetResourceName(
      context.customerId, args.assetGroupResourceName, link
    ) })
  }
  if (operations.length === 0) throw new Error('Asset-group membership already matches the requested assets')
  return {
    resourceName: args.assetGroupResourceName,
    desiredState: { assetGroupResourceName: args.assetGroupResourceName, assets: desiredAssets },
    providerOperations: [{
      service: 'assetGroupAssets',
      atomicity: 'interdependent',
      partialFailure: false,
      operations
    }]
  }
}

function buildListingGroupAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'listing_group') {
    throw new Error('Listing-group replacement requires resource type listing_group')
  }
  const args = SetListingGroupsArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.assetGroupResourceName, context.customerId, 'assetGroups')
  const current = ListingGroupCurrentStateSchema.parse(context.currentState)
  if (current.assetGroup.resourceName !== args.assetGroupResourceName) {
    throw new Error('Listing-group state does not match the requested asset group')
  }
  assertResourceName(current.assetGroup.campaign, context.customerId, 'campaigns')
  if (current.assetGroup.status === 'REMOVED') throw new Error('A removed asset group cannot be updated')
  if (current.campaign.advertisingChannelType !== 'PERFORMANCE_MAX' || !current.campaign.merchantId) {
    throw new Error('Listing groups are available only for Performance Max retail campaigns')
  }
  const desiredNodes = validateAndNormalizeListingGroupNodes(args.nodes)
  const currentNodes = normalizeExistingListingGroupFilters(current.filters)
  if (JSON.stringify(currentNodes) === JSON.stringify(desiredNodes)) {
    throw new Error('The retail listing-group tree already matches the requested tree')
  }
  return {
    resourceName: args.assetGroupResourceName,
    desiredState: { assetGroupResourceName: args.assetGroupResourceName, nodes: desiredNodes },
    providerOperations: [{
      service: 'googleAds',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: buildListingGroupProviderOperations({
        customerId: context.customerId,
        assetGroupResourceName: args.assetGroupResourceName,
        desiredNodes,
        existingFilters: current.filters
      })
    }]
  }
}

function buildRecommendationAction(
  context: BuildGoogleAdsActionContext,
  disposition: 'APPLIED' | 'DISMISSED'
): BuiltGoogleAdsAction {
  if (context.input.resourceType !== 'recommendation') {
    throw new Error('Recommendation mutation requires resource type recommendation')
  }
  const args = RecommendationArgumentsSchema.parse(context.input.arguments)
  assertResourceName(args.resourceName, context.customerId, 'recommendations')
  const current = RecommendationStateSchema.parse(context.currentState)
  if (current.resourceName !== args.resourceName) throw new Error('Recommendation state does not match the request')
  if (current.dismissed) throw new Error('The Google Ads recommendation is already dismissed')
  const targets = [current.campaign, current.adGroup, current.campaignBudget, ...current.campaigns]
    .filter((value): value is string => Boolean(value))
  if (targets.some(resourceName => !resourceName.startsWith(`customers/${context.customerId}/`))) {
    throw new Error('Recommendation targets another Google Ads customer')
  }
  return {
    resourceName: args.resourceName,
    desiredState: {
      ...current,
      dismissed: disposition === 'DISMISSED',
      disposition
    },
    providerOperations: [{
      service: disposition === 'APPLIED' ? 'recommendationsApply' : 'recommendationsDismiss',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ recommendation: { resourceName: args.resourceName } }]
    }]
  }
}

export function buildSearchGoogleAdsAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (isStatusOperation(context.input.operation)) {
    return buildStatusAction(context, context.input.operation)
  }
  if (isRemoveOperation(context.input.operation)) {
    return buildRemoveAction(context, context.input.operation)
  }
  if (context.input.operation === 'add_negative_keywords') {
    return buildNegativeKeywordAction(context)
  }
  if (context.input.operation === 'create_budget' || context.input.operation === 'update_budget') {
    return buildBudgetAction(context)
  }
  if (context.input.operation === 'create_campaign') return buildCreateCampaignAction(context)
  if (context.input.operation === 'update_campaign') return buildUpdateCampaignAction(context)
  if (context.input.operation === 'create_ad_group') return buildCreateAdGroupAction(context)
  if (context.input.operation === 'update_ad_group') return buildUpdateAdGroupAction(context)
  if (context.input.operation === 'create_ad') return buildCreateResponsiveSearchAdAction(context)
  if (context.input.operation === 'add_keywords') return buildPositiveKeywordAction(context)
  if (context.input.operation === 'update_keyword') return buildUpdateKeywordAction(context)
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
  if (context.input.operation === 'set_conversion_goal') return buildCampaignGoalConfigAction(context)
  if (context.input.operation === 'set_customer_goal_biddability') return buildCustomerGoalBiddabilityAction(context)
  if (context.input.operation === 'set_conversion_primary_state') return buildConversionPrimaryStateAction(context)
  if (context.input.operation === 'create_conversion_action') return buildCreateConversionAction(context)
  if (context.input.operation === 'update_conversion_action') return buildUpdateConversionAction(context)
  if (context.input.operation === 'archive_conversion_action') return buildConversionActionDisposition(context, 'archive')
  if (context.input.operation === 'remove_conversion_action') return buildConversionActionDisposition(context, 'remove')
  if (context.input.operation === 'create_custom_conversion_goal') return buildCreateCustomConversionGoal(context)
  if (context.input.operation === 'update_custom_conversion_goal') return buildUpdateCustomConversionGoal(context)
  if (context.input.operation === 'archive_custom_conversion_goal') return buildArchiveCustomConversionGoal(context)
  if (context.input.operation === 'manage_custom_audience') return buildManageCustomAudienceAction(context)
  if (context.input.operation === 'archive_custom_audience') return buildArchiveCustomAudienceAction(context)
  if (context.input.operation === 'set_pmax_signals') return buildPmaxAudienceSignalsAction(context)
  if (context.input.operation === 'set_search_themes') return buildPmaxSearchThemesAction(context)
  if (context.input.operation === 'create_asset') return buildCreateAssetAction(context)
  if (context.input.operation === 'attach_asset') return buildAttachAssetAction(context)
  if (context.input.operation === 'archive_asset_link') return buildAssetLinkDispositionAction(context, 'archive')
  if (context.input.operation === 'detach_asset') return buildAssetLinkDispositionAction(context, 'detach')
  if (context.input.operation === 'create_asset_group') return buildCreateAssetGroupAction(context)
  if (context.input.operation === 'update_asset_group') return buildUpdateAssetGroupAction(context)
  if (context.input.operation === 'manage_asset_group_assets') return buildAssetGroupMembershipAction(context)
  if (context.input.operation === 'manage_listing_groups') return buildListingGroupAction(context)
  if (context.input.operation === 'apply_recommendation') return buildRecommendationAction(context, 'APPLIED')
  if (context.input.operation === 'dismiss_recommendation') return buildRecommendationAction(context, 'DISMISSED')
  throw new Error(`Unsupported Search Google Ads operation: ${context.input.operation}`)
}
