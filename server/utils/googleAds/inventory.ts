import { z } from 'zod'
import type { GoogleAdsAuth } from '~~/server/utils/googleAds/api'
import {
  executeGoogleAdsQuery,
  type ExecuteGoogleAdsQueryInput
} from '~~/server/utils/googleAds/query'

export const GoogleAdsInventoryKindSchema = z.enum([
  'campaign', 'ad_group', 'ad', 'keyword', 'targeting', 'asset', 'conversion_action'
])
export type GoogleAdsInventoryKind = z.infer<typeof GoogleAdsInventoryKindSchema>

const EntityStatusSchema = z.enum(['ALL', 'ENABLED', 'PAUSED', 'REMOVED'])
const ConversionStatusSchema = z.enum(['ALL', 'ENABLED', 'HIDDEN', 'REMOVED'])
const BaseInput = {
  customerId: z.string().regex(/^\d{1,20}$/),
  auth: z.custom<GoogleAdsAuth>(),
  maxResults: z.number().int().min(1).max(500)
}
const ParentFilters = {
  campaignResourceName: z.string().optional(),
  adGroupResourceName: z.string().optional()
}
const InputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('campaign'), ...BaseInput, status: EntityStatusSchema }),
  z.strictObject({ kind: z.literal('ad_group'), ...BaseInput, status: EntityStatusSchema, campaignResourceName: z.string().optional() }),
  z.strictObject({ kind: z.literal('ad'), ...BaseInput, status: EntityStatusSchema, ...ParentFilters }),
  z.strictObject({
    kind: z.literal('keyword'), ...BaseInput, status: EntityStatusSchema, ...ParentFilters,
    includeNegative: z.boolean().default(true)
  }),
  z.strictObject({
    kind: z.literal('targeting'), ...BaseInput, ...ParentFilters,
    scope: z.enum(['CAMPAIGN', 'AD_GROUP', 'BOTH']).default('BOTH')
  }),
  z.strictObject({ kind: z.literal('asset'), ...BaseInput }),
  z.strictObject({ kind: z.literal('conversion_action'), ...BaseInput, status: ConversionStatusSchema })
])

export type ListGoogleAdsInventoryInput = z.input<typeof InputSchema>

interface InventoryDependencies {
  query(input: ExecuteGoogleAdsQueryInput): Promise<{
    rows: unknown[]
    more: number
    requestId?: string
  }>
  now?: () => Date
}

const defaultDependencies: InventoryDependencies = {
  query: input => executeGoogleAdsQuery(input)
}

const IntegerString = z.union([z.string(), z.number()]).transform(String)
const OptionalIntegerString = IntegerString.optional()
const CampaignSchema = z.object({
  resourceName: z.string(), id: IntegerString, name: z.string(), status: z.string(),
  advertisingChannelType: z.string(), campaignBudget: z.string().optional(),
  startDate: z.string().optional(), endDate: z.string().optional(),
  biddingStrategyType: z.string().optional()
})
const AdGroupSchema = z.object({
  resourceName: z.string(), id: IntegerString, name: z.string(), status: z.string(),
  type: z.string(), cpcBidMicros: OptionalIntegerString
})
const AdSchema = z.object({
  resourceName: z.string().optional(), id: IntegerString, name: z.string().optional(),
  type: z.string(), finalUrls: z.array(z.string()).default([])
})
const AdGroupAdSchema = z.object({
  resourceName: z.string(), status: z.string(), primaryStatus: z.string().optional(),
  policySummary: z.object({
    approvalStatus: z.string().optional(), reviewStatus: z.string().optional()
  }).optional(),
  ad: AdSchema
})
const KeywordCriterionSchema = z.object({
  resourceName: z.string(), status: z.string(), negative: z.boolean(),
  keyword: z.object({ text: z.string(), matchType: z.string() }),
  qualityInfo: z.object({ qualityScore: z.number().int().min(0).max(10).optional() }).optional()
})
const AssetSchema = z.object({
  resourceName: z.string(), id: IntegerString, name: z.string().optional(),
  type: z.string(), source: z.string().optional()
})
const ConversionActionSchema = z.object({
  resourceName: z.string(), id: IntegerString, name: z.string(), status: z.string(),
  type: z.string(), category: z.string(), origin: z.string(), primaryForGoal: z.boolean(),
  ownerCustomer: z.string().optional(), countingType: z.string().optional()
})
type ConversionAction = z.infer<typeof ConversionActionSchema>
const CustomerConversionGoalSchema = z.object({
  category: z.string(), origin: z.string(), biddable: z.boolean()
})

export const GoogleAdsDeliveryClassSchema = z.enum([
  'website_tag', 'offline_click', 'google_hosted_call', 'google_hosted_local', 'external', 'unknown'
])
export const GoogleAdsManagementOwnerSchema = z.enum([
  'xeroflow', 'gtm', 'google', 'partner', 'external'
])

const HOSTED_CALL_TYPES = new Set([
  'CALL_FROM_ADS', 'CALL_FROM_WEBSITE', 'CLICK_TO_CALL', 'PHONE_CALL_LEAD'
])
const HOSTED_LOCAL_TYPES = new Set([
  'LOCAL_ACTIONS', 'STORE_SALES', 'STORE_VISITS'
])
const OFFLINE_CLICK_TYPES = new Set([
  'UPLOAD_CLICKS', 'UPLOAD_CALLS'
])

/**
 * Classify a provider action by how evidence reaches Google and who operates
 * that path. Type and origin are used instead of names so translated or renamed
 * actions cannot turn a website click into a provider-hosted call.
 */
export function classifyGoogleAdsConversionAction(
  action: Pick<ConversionAction, 'type' | 'origin' | 'category' | 'name'>
) {
  const type = action.type.toUpperCase()
  const origin = action.origin.toUpperCase()
  if (type === 'THIRD_PARTY' || origin === 'PARTNER') {
    return { deliveryClass: 'external' as const, managementOwner: 'partner' as const }
  }
  if (HOSTED_CALL_TYPES.has(type)) {
    return { deliveryClass: 'google_hosted_call' as const, managementOwner: 'google' as const }
  }
  if (HOSTED_LOCAL_TYPES.has(type) || (origin === 'GOOGLE_HOSTED' && action.category.toUpperCase().includes('LOCAL'))) {
    return { deliveryClass: 'google_hosted_local' as const, managementOwner: 'google' as const }
  }
  if (OFFLINE_CLICK_TYPES.has(type) || origin === 'IMPORT') {
    return { deliveryClass: 'offline_click' as const, managementOwner: 'xeroflow' as const }
  }
  if (origin === 'WEBSITE') {
    return { deliveryClass: 'website_tag' as const, managementOwner: 'gtm' as const }
  }
  if (origin === 'GOOGLE_HOSTED') {
    return { deliveryClass: 'external' as const, managementOwner: 'google' as const }
  }
  if (origin === 'APP') {
    return { deliveryClass: 'external' as const, managementOwner: 'external' as const }
  }
  return { deliveryClass: 'unknown' as const, managementOwner: 'external' as const }
}

function normalizeConversionAction(
  action: ConversionAction,
  providerSyncedAt: string,
  customerGoalBiddable?: boolean
) {
  return {
    ...action,
    ...classifyGoogleAdsConversionAction(action),
    primaryState: action.primaryForGoal ? 'primary' as const : 'secondary' as const,
    goalBiddability: !action.primaryForGoal || customerGoalBiddable === false
      ? 'not_biddable' as const
      : customerGoalBiddable === true
        ? 'biddable' as const
        : 'unknown' as const,
    mappingState: 'unmapped' as const,
    providerSyncedAt,
    lastEvidenceAt: null
  }
}
const CriterionSchema = z.object({
  resourceName: z.string(), campaign: z.string().optional(), adGroup: z.string().optional(),
  status: z.string().optional(), type: z.string(), negative: z.boolean().default(false),
  bidModifier: z.number().optional(),
  location: z.object({ geoTargetConstant: z.string() }).optional(),
  language: z.object({ languageConstant: z.string() }).optional(),
  adSchedule: z.object({
    dayOfWeek: z.string(), startHour: z.number(), startMinute: z.string(),
    endHour: z.number(), endMinute: z.string()
  }).optional(),
  device: z.object({ type: z.string() }).optional(),
  contentLabel: z.object({ type: z.string() }).optional(),
  placement: z.object({ url: z.string() }).optional(),
  audience: z.object({ audience: z.string() }).optional(),
  combinedAudience: z.object({ combinedAudience: z.string() }).optional(),
  customAudience: z.object({ customAudience: z.string() }).optional(),
  userList: z.object({ userList: z.string() }).optional(),
  userInterest: z.object({ userInterestCategory: z.string() }).optional(),
  ageRange: z.object({ type: z.string() }).optional(),
  gender: z.object({ type: z.string() }).optional()
})

function assertCustomerResources(value: unknown, customerId: string): void {
  if (typeof value === 'string') {
    const match = value.match(/^customers\/(\d{1,20})(?:\/|$)/)
    if (match && match[1] !== customerId) throw new Error('Google Ads returned a cross-customer resource')
    return
  }
  if (Array.isArray(value)) {
    value.forEach(item => assertCustomerResources(item, customerId))
    return
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>)
      .forEach(item => assertCustomerResources(item, customerId))
  }
}

function resourceId(resourceName: string | undefined, customerId: string, segment: string): string | null {
  if (resourceName === undefined) return null
  const match = resourceName.match(new RegExp(`^customers/(\\d{1,20})/${segment}/(\\d{1,20})$`))
  if (!match || match[1] !== customerId) {
    throw new Error('A parent resource is outside the selected Google Ads customer')
  }
  return match[2]!
}

function where(filters: string[]): string {
  return filters.length > 0 ? `\nWHERE ${filters.join('\n  AND ')}` : ''
}

function statusFilter(field: string, status: string): string[] {
  return status === 'ALL' ? [] : [`${field} = '${status}'`]
}

function parentFilters(
  input: { campaignResourceName?: string, adGroupResourceName?: string },
  customerId: string
): string[] {
  const campaignId = resourceId(input.campaignResourceName, customerId, 'campaigns')
  const adGroupId = resourceId(input.adGroupResourceName, customerId, 'adGroups')
  return [
    ...(campaignId ? [`campaign.id = ${campaignId}`] : []),
    ...(adGroupId ? [`ad_group.id = ${adGroupId}`] : [])
  ]
}

function resultEnvelope(
  input: { customerId: string, kind: GoogleAdsInventoryKind },
  result: { rows: unknown[], more: number, requestId?: string },
  items: unknown[]
): Record<string, unknown> {
  items.forEach(item => assertCustomerResources(item, input.customerId))
  return {
    customerId: input.customerId,
    kind: input.kind,
    items,
    ...(result.more > 0 ? { truncated: true } : {}),
    ...(result.requestId ? { requestId: result.requestId } : {})
  }
}

async function listSingle(
  input: Exclude<z.output<typeof InputSchema>, { kind: 'targeting' }>,
  dependencies: InventoryDependencies
): Promise<Record<string, unknown>> {
  let query: string
  let normalize: (row: unknown) => unknown
  if (input.kind === 'campaign') {
    query = `SELECT campaign.resource_name, campaign.id, campaign.name, campaign.status,
  campaign.advertising_channel_type, campaign.campaign_budget, campaign.start_date,
  campaign.end_date, campaign.bidding_strategy_type
FROM campaign${where(statusFilter('campaign.status', input.status))}`
    normalize = row => CampaignSchema.parse(z.object({ campaign: z.unknown() }).parse(row).campaign)
  } else if (input.kind === 'ad_group') {
    const filters = [
      ...statusFilter('ad_group.status', input.status),
      ...parentFilters(input, input.customerId)
    ]
    query = `SELECT campaign.resource_name, campaign.name, ad_group.resource_name, ad_group.id,
  ad_group.name, ad_group.status, ad_group.type, ad_group.cpc_bid_micros
FROM ad_group${where(filters)}`
    normalize = (row) => {
      const parsed = z.object({ campaign: z.object({ resourceName: z.string(), name: z.string() }), adGroup: z.unknown() }).parse(row)
      return { campaign: parsed.campaign, ...AdGroupSchema.parse(parsed.adGroup) }
    }
  } else if (input.kind === 'ad') {
    const filters = [...statusFilter('ad_group_ad.status', input.status), ...parentFilters(input, input.customerId)]
    query = `SELECT campaign.resource_name, campaign.name, ad_group.resource_name, ad_group.name,
  ad_group_ad.resource_name, ad_group_ad.status, ad_group_ad.primary_status,
  ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status,
  ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.final_urls
FROM ad_group_ad${where(filters)}`
    normalize = (row) => {
      const parsed = z.object({
        campaign: z.object({ resourceName: z.string(), name: z.string() }),
        adGroup: z.object({ resourceName: z.string(), name: z.string() }), adGroupAd: z.unknown()
      }).parse(row)
      return { campaign: parsed.campaign, adGroup: parsed.adGroup, ...AdGroupAdSchema.parse(parsed.adGroupAd) }
    }
  } else if (input.kind === 'keyword') {
    const filters = [
      'ad_group_criterion.type = \'KEYWORD\'',
      ...statusFilter('ad_group_criterion.status', input.status),
      ...(input.includeNegative ? [] : ['ad_group_criterion.negative = FALSE']),
      ...parentFilters(input, input.customerId)
    ]
    query = `SELECT campaign.resource_name, campaign.name, ad_group.resource_name, ad_group.name,
  ad_group_criterion.resource_name, ad_group_criterion.status, ad_group_criterion.negative,
  ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
  ad_group_criterion.quality_info.quality_score
FROM ad_group_criterion${where(filters)}`
    normalize = (row) => {
      const parsed = z.object({
        campaign: z.object({ resourceName: z.string(), name: z.string() }),
        adGroup: z.object({ resourceName: z.string(), name: z.string() }), adGroupCriterion: z.unknown()
      }).parse(row)
      return { campaign: parsed.campaign, adGroup: parsed.adGroup, ...KeywordCriterionSchema.parse(parsed.adGroupCriterion) }
    }
  } else if (input.kind === 'asset') {
    query = 'SELECT asset.resource_name, asset.id, asset.name, asset.type, asset.source\nFROM asset'
    normalize = row => AssetSchema.parse(z.object({ asset: z.unknown() }).parse(row).asset)
  } else {
    query = `SELECT conversion_action.resource_name, conversion_action.id, conversion_action.name,
  conversion_action.status, conversion_action.type, conversion_action.category,
  conversion_action.origin, conversion_action.primary_for_goal, conversion_action.owner_customer,
  conversion_action.counting_type
FROM conversion_action${where(statusFilter('conversion_action.status', input.status))}`
    const providerSyncedAt = (dependencies.now ?? (() => new Date()))().toISOString()
    normalize = row => normalizeConversionAction(
      ConversionActionSchema.parse(z.object({ conversionAction: z.unknown() }).parse(row).conversionAction),
      providerSyncedAt
    )
  }
  const result = await dependencies.query({
    customerId: input.customerId, auth: input.auth, maxRows: input.maxResults, query
  })
  if (input.kind === 'conversion_action') {
    const goalResult = await dependencies.query({
      customerId: input.customerId,
      auth: input.auth,
      maxRows: input.maxResults,
      query: `SELECT customer_conversion_goal.category, customer_conversion_goal.origin,
  customer_conversion_goal.biddable
FROM customer_conversion_goal`
    })
    const biddability = new Map<string, boolean>()
    for (const row of goalResult.rows) {
      const container = z.object({ customerConversionGoal: z.unknown() }).safeParse(row)
      if (!container.success) continue
      const goal = CustomerConversionGoalSchema.safeParse(container.data.customerConversionGoal)
      if (goal.success) biddability.set(`${goal.data.category}:${goal.data.origin}`, goal.data.biddable)
    }
    const providerSyncedAt = (dependencies.now ?? (() => new Date()))().toISOString()
    const items = result.rows.map((row) => {
      const action = ConversionActionSchema.parse(
        z.object({ conversionAction: z.unknown() }).parse(row).conversionAction
      )
      return normalizeConversionAction(
        action,
        providerSyncedAt,
        biddability.get(`${action.category}:${action.origin}`)
      )
    })
    return resultEnvelope(input, result, items)
  }
  return resultEnvelope(input, result, result.rows.map(normalize))
}

async function listTargeting(
  input: Extract<z.output<typeof InputSchema>, { kind: 'targeting' }>,
  dependencies: InventoryDependencies
): Promise<Record<string, unknown>> {
  const filters = parentFilters(input, input.customerId)
  const commonFields = [
    'resource_name', 'status', 'type', 'negative', 'bid_modifier',
    'location.geo_target_constant', 'language.language_constant', 'ad_schedule.day_of_week',
    'ad_schedule.start_hour', 'ad_schedule.start_minute', 'ad_schedule.end_hour',
    'ad_schedule.end_minute', 'device.type', 'content_label.type', 'placement.url',
    'age_range.type', 'gender.type', 'combined_audience.combined_audience',
    'custom_audience.custom_audience', 'user_list.user_list',
    'user_interest.user_interest_category'
  ]
  const selectFields = (prefix: string, fields: string[]) => fields
    .map(field => `${prefix}.${field}`)
    .join(',\n  ')
  const campaignResult = input.scope === 'AD_GROUP'
    ? null
    : await dependencies.query({
        customerId: input.customerId, auth: input.auth, maxRows: input.maxResults,
        query: `SELECT campaign_criterion.campaign, ${selectFields('campaign_criterion', commonFields)}
FROM campaign_criterion${where(filters.filter(filter => !filter.startsWith('ad_group.')))}`
      })
  const adGroupResult = input.scope === 'CAMPAIGN'
    ? null
    : await dependencies.query({
        customerId: input.customerId, auth: input.auth, maxRows: input.maxResults,
        query: `SELECT ad_group_criterion.ad_group, ${selectFields('ad_group_criterion', [
          ...commonFields,
          'audience.audience'
        ])}
FROM ad_group_criterion${where(filters)}`
      })
  const campaignCriteria = (campaignResult?.rows ?? []).map((row) => {
    const value = z.object({ campaignCriterion: z.unknown() }).parse(row).campaignCriterion
    return CriterionSchema.parse(value)
  })
  const adGroupCriteria = (adGroupResult?.rows ?? []).map((row) => {
    const value = z.object({ adGroupCriterion: z.unknown() }).parse(row).adGroupCriterion
    return CriterionSchema.parse(value)
  })
  const output = {
    customerId: input.customerId,
    kind: input.kind,
    campaignCriteria,
    adGroupCriteria,
    ...((campaignResult?.more ?? 0) > 0 || (adGroupResult?.more ?? 0) > 0 ? { truncated: true } : {}),
    requestIds: [campaignResult?.requestId, adGroupResult?.requestId]
      .filter((value): value is string => Boolean(value))
  }
  assertCustomerResources(output, input.customerId)
  return output
}

export async function listGoogleAdsInventory(
  rawInput: ListGoogleAdsInventoryInput,
  dependencies: Partial<InventoryDependencies> = {}
): Promise<Record<string, unknown>> {
  const input = InputSchema.parse(rawInput)
  const resolved = { ...defaultDependencies, ...dependencies }
  return input.kind === 'targeting'
    ? listTargeting(input, resolved)
    : listSingle(input, resolved)
}
