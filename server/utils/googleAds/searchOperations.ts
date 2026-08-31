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
      'set_locations'
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
  throw new Error(`Unsupported Search Google Ads operation: ${context.input.operation}`)
}
