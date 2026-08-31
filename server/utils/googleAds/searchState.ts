import { z } from 'zod'
import type { BuildGoogleAdsActionContext } from '~~/server/utils/googleAds/actionPlanner'
import { diffGoogleAdsStates } from '~~/server/utils/googleAds/actionPlanner'
import type {
  GoogleAdsActionPlan,
  GoogleAdsVerificationDiff
} from '~~/server/utils/googleAds/contracts'
import type { GoogleAdsAuth } from '~~/server/utils/googleAds/api'
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
  throw new Error(`Unsupported Search Google Ads operation: ${context.input.operation}`)
}

export async function loadSearchGoogleAdsPlanState(
  plan: GoogleAdsActionPlan,
  auth: GoogleAdsAuth,
  dependencies: Partial<SearchStateDependencies> = {}
): Promise<unknown> {
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

export function verifySearchGoogleAdsState(
  expected: unknown,
  actual: unknown
): { ok: boolean, diffs: GoogleAdsVerificationDiff[] } {
  const differences = diffGoogleAdsStates(
    normalizeVerificationState(expected),
    normalizeVerificationState(actual)
  )
  const diffs = differences.map(diff => ({
    field: diff.field,
    expected: diff.before,
    actual: diff.after
  }))
  return { ok: diffs.length === 0, diffs }
}
