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

function resourcePattern(customerId: string, segment: string): RegExp {
  const suffix = segment === 'adGroupAds' || segment === 'adGroupCriteria'
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

export function parseSearchGoogleAdsArguments(
  operation: GoogleAdsOperationType,
  argumentsValue: unknown
): unknown {
  if (isStatusOperation(operation)) return ResourceNameArgumentsSchema.parse(argumentsValue)
  if (operation === 'add_negative_keywords') return NegativeKeywordArgumentsSchema.parse(argumentsValue)
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

export function buildSearchGoogleAdsAction(context: BuildGoogleAdsActionContext): BuiltGoogleAdsAction {
  if (isStatusOperation(context.input.operation)) {
    return buildStatusAction(context, context.input.operation)
  }
  if (context.input.operation === 'add_negative_keywords') {
    return buildNegativeKeywordAction(context)
  }
  throw new Error(`Unsupported Search Google Ads operation: ${context.input.operation}`)
}
