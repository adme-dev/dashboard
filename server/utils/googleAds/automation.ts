import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { hashGoogleAdsValue } from '~~/server/utils/googleAds/actionPlanner'
import { appendGoogleAdsActionEvent } from '~~/server/utils/googleAds/actionStore'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import { resolveGoogleAdsControlSession } from '~~/server/utils/googleAds/controlSession'
import {
  executeGoogleAdsQuery,
  type ExecuteGoogleAdsQueryInput
} from '~~/server/utils/googleAds/query'
import {
  executeSearchGoogleAdsControlAction,
  loadGoogleAdsAutomationPolicy,
  planSearchGoogleAdsControlAction,
  type GoogleAdsAutomationPolicyGrant,
  type GoogleAdsControlAuthority,
  type GoogleAdsControlFlags
} from '~~/server/utils/googleAds/searchRuntime'

const UuidSchema = z.string().uuid()
const CustomerResourceSchema = z.string().regex(/^customers\/(\d{1,20})\/(campaigns|adGroups|adGroupAds|adGroupCriteria)\/\d+(?:~\d+)?$/)
const SearchPolicyInputSchema = z.strictObject({
  clientId: UuidSchema,
  connectionId: UuidSchema,
  actorId: UuidSchema,
  scope: z.enum(['campaign', 'ad_group']),
  parentResourceName: CustomerResourceSchema
})
const PausePolicyInputSchema = z.strictObject({
  clientId: UuidSchema,
  connectionId: UuidSchema,
  actorId: UuidSchema,
  entityType: z.enum(['campaign', 'ad_group', 'ad', 'keyword']),
  resourceName: CustomerResourceSchema
})

const CommonRunnerConditions = {
  lookbackDays: z.number().int().min(1).max(90),
  cooldownHours: z.number().int().min(1).max(24 * 90)
}
const SearchTermPolicyConditionsSchema = z.strictObject({
  ...CommonRunnerConditions,
  allowedScopes: z.array(z.enum(['campaign', 'ad_group'])).min(1).max(2),
  resourceNames: z.array(CustomerResourceSchema).min(1).max(1_000),
  protectedTerms: z.array(z.string().trim().min(1).max(80)).max(1_000),
  minImpressions: z.number().int().min(0),
  minClicks: z.number().int().min(0),
  minSpendMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  maxConversions: z.number().finite().min(0),
  negativeMatchType: z.enum(['EXACT', 'PHRASE', 'BROAD']),
  allowedMatchTypes: z.array(z.enum(['EXACT', 'PHRASE', 'BROAD'])).min(1).max(3),
  maxKeywordsPerAction: z.number().int().min(1).max(100),
  maxAdditionsPerRun: z.number().int().min(1).max(100)
}).superRefine((value, refinement) => {
  if (value.minImpressions === 0 && value.minClicks === 0 && value.minSpendMicros === 0) {
    refinement.addIssue({ code: 'custom', message: 'A search-term policy requires a positive evidence threshold' })
  }
  if (!value.allowedMatchTypes.includes(value.negativeMatchType)) {
    refinement.addIssue({ code: 'custom', message: 'The automatic negative match type must be allowlisted' })
  }
})
const PausePolicyConditionsSchema = z.strictObject({
  ...CommonRunnerConditions,
  allowedResourceTypes: z.array(z.enum(['campaign', 'ad_group', 'ad', 'keyword'])).min(1).max(4),
  resourceNames: z.array(CustomerResourceSchema).min(1).max(1_000),
  minImpressions: z.number().int().min(0),
  minClicks: z.number().int().min(0),
  minSpendMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  maxConversions: z.number().finite().min(0)
}).superRefine((value, refinement) => {
  if (value.minImpressions === 0 && value.minClicks === 0 && value.minSpendMicros === 0) {
    refinement.addIssue({ code: 'custom', message: 'A pause policy requires a positive evidence threshold' })
  }
})

const MetricsSchema = z.object({
  impressions: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
  clicks: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
  costMicros: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
  conversions: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().finite().nonnegative())
})
const SearchTermRowSchema = z.object({
  searchTermView: z.object({
    searchTerm: z.string().min(1),
    status: z.enum(['ADDED', 'ADDED_EXCLUDED', 'EXCLUDED', 'NONE']),
    adGroup: z.string()
  }),
  campaign: z.object({ resourceName: z.string() }),
  metrics: MetricsSchema
})
const PositiveKeywordRowSchema = z.object({
  adGroupCriterion: z.object({
    negative: z.literal(false),
    status: z.enum(['ENABLED', 'PAUSED']),
    keyword: z.object({ text: z.string().min(1) })
  })
})

type RunnerBlockReason = 'feature_disabled' | 'policy_missing' | 'policy_invalid' | 'scope_blocked' | 'daily_cap' | 'cooldown' | 'manual_override' | 'threshold_not_met' | 'no_candidates' | 'plan_blocked'
type RecentActionReason = 'cooldown' | 'manual_override' | null

export interface GoogleAdsAutomationRunnerDependencies {
  resolveSession: typeof resolveGoogleAdsControlSession
  loadPolicy(input: {
    clientId: string
    connectionId: string
    customerId: string
    actionClass: 'negative_keywords' | 'pause'
  }): Promise<GoogleAdsAutomationPolicyGrant | null>
  query(input: ExecuteGoogleAdsQueryInput): Promise<{ rows: unknown[], more: number }>
  recentAction(input: {
    clientId: string
    connectionId: string
    customerId: string
    resourceName: string
    operations: string[]
    cooldownHours: number
  }): Promise<RecentActionReason>
  plan: typeof planSearchGoogleAdsControlAction
  execute(
    plan: GoogleAdsActionPlan,
    authority: GoogleAdsControlAuthority,
    flags: GoogleAdsControlFlags
  ): ReturnType<typeof executeSearchGoogleAdsControlAction>
  event(input: Parameters<typeof appendGoogleAdsActionEvent>[0]): Promise<unknown>
}

const defaultDependencies: GoogleAdsAutomationRunnerDependencies = {
  resolveSession: resolveGoogleAdsControlSession,
  loadPolicy: loadGoogleAdsAutomationPolicy,
  query: input => executeGoogleAdsQuery(input),
  recentAction: async (input) => {
    const row = await queryOne<{ reason: RecentActionReason }>(`
      SELECT CASE
        WHEN source <> 'automation' THEN 'manual_override'
        ELSE 'cooldown'
      END AS reason
      FROM google_ads_action_plans
      WHERE client_id = $1
        AND connection_id = $2
        AND customer_id = $3
        AND resource_name = $4
        AND operation = ANY($5::text[])
        AND status IN ('pending_approval', 'approved', 'executing', 'verified', 'partially_verified')
        AND created_at >= NOW() - make_interval(hours => $6)
      ORDER BY (source <> 'automation') DESC, created_at DESC
      LIMIT 1
    `, [
      input.clientId,
      input.connectionId,
      input.customerId,
      input.resourceName,
      input.operations,
      input.cooldownHours
    ])
    return row?.reason ?? null
  },
  plan: planSearchGoogleAdsControlAction,
  execute: (plan, authority, flags) => executeSearchGoogleAdsControlAction(plan, authority, flags),
  event: appendGoogleAdsActionEvent
}

function normalizeTerm(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-AU')
}

function containsProtectedPhrase(term: string, protectedTerm: string): boolean {
  return ` ${term} `.includes(` ${protectedTerm} `)
}

function dateRange(lookbackDays: number, now: Date): { startDate: string, endDate: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - lookbackDays + 1)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  }
}

function customerIdFromResource(resourceName: string): string {
  const match = resourceName.match(/^customers\/(\d+)\//)
  if (!match) throw new Error('Invalid Google Ads resource name')
  return match[1]!
}

function blocked(
  actionClass: 'negative_keywords' | 'pause',
  reason: RunnerBlockReason,
  evidence: Record<string, unknown> = {}
): Record<string, unknown> {
  return { actionClass, executed: false, reason, evidence }
}

function meetsThresholds(
  metrics: z.infer<typeof MetricsSchema>,
  conditions: { minImpressions: number, minClicks: number, minSpendMicros: number, maxConversions: number }
): boolean {
  return metrics.impressions >= conditions.minImpressions
    && metrics.clicks >= conditions.minClicks
    && metrics.costMicros >= conditions.minSpendMicros
    && metrics.conversions <= conditions.maxConversions
}

export async function runGoogleAdsSearchTermPolicy(
  rawInput: unknown,
  authority: GoogleAdsControlAuthority,
  flags: GoogleAdsControlFlags,
  overrides: Partial<GoogleAdsAutomationRunnerDependencies> = {},
  now = new Date()
): Promise<Record<string, unknown>> {
  const input = SearchPolicyInputSchema.parse(rawInput)
  if (!flags.write || !flags.automation || !authority.hasWriteScope) {
    return blocked('negative_keywords', 'feature_disabled')
  }
  const dependencies = { ...defaultDependencies, ...overrides }
  const session = await dependencies.resolveSession({
    clientId: input.clientId,
    connectionId: input.connectionId
  })
  if (customerIdFromResource(input.parentResourceName) !== session.connection.customerId) {
    throw new Error('Google Ads automation resource belongs to another customer')
  }
  const expectedParent = input.scope === 'campaign' ? 'campaigns' : 'adGroups'
  if (!input.parentResourceName.includes(`/${expectedParent}/`)) {
    throw new Error('Google Ads automation scope does not match its parent resource')
  }
  const grant = await dependencies.loadPolicy({
    clientId: input.clientId,
    connectionId: input.connectionId,
    customerId: session.connection.customerId,
    actionClass: 'negative_keywords'
  })
  if (!grant?.enabled) return blocked('negative_keywords', 'policy_missing')
  if (grant.maxDailyActions !== null && grant.actionsToday >= grant.maxDailyActions) {
    return blocked('negative_keywords', 'daily_cap')
  }
  const conditions = SearchTermPolicyConditionsSchema.safeParse(grant.conditions)
  if (!conditions.success) return blocked('negative_keywords', 'policy_invalid')
  if (!conditions.data.allowedScopes.includes(input.scope)
    || !conditions.data.resourceNames.includes(input.parentResourceName)) {
    return blocked('negative_keywords', 'scope_blocked')
  }
  const recent = await dependencies.recentAction({
    clientId: input.clientId,
    connectionId: input.connectionId,
    customerId: session.connection.customerId,
    resourceName: input.parentResourceName,
    operations: ['add_negative_keywords'],
    cooldownHours: conditions.data.cooldownHours
  })
  if (recent) return blocked('negative_keywords', recent)

  const range = dateRange(conditions.data.lookbackDays, now)
  const parentFilter = input.scope === 'campaign'
    ? `campaign.resource_name = '${input.parentResourceName}'`
    : `search_term_view.ad_group = '${input.parentResourceName}'`
  const searchTerms = await dependencies.query({
    customerId: session.connection.customerId,
    auth: session.auth,
    maxRows: 1_000,
    query: `SELECT search_term_view.search_term,
  search_term_view.status,
  search_term_view.ad_group,
  campaign.resource_name,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM search_term_view
WHERE ${parentFilter}
  AND segments.date BETWEEN '${range.startDate}' AND '${range.endDate}'`
  })
  if (searchTerms.more > 0) {
    return blocked('negative_keywords', 'policy_invalid', { code: 'search_term_limit_exceeded' })
  }
  const keywordParentFilter = input.scope === 'campaign'
    ? `campaign.resource_name = '${input.parentResourceName}'`
    : `ad_group.resource_name = '${input.parentResourceName}'`
  const positiveKeywords = await dependencies.query({
    customerId: session.connection.customerId,
    auth: session.auth,
    maxRows: 10_000,
    query: `SELECT ad_group_criterion.negative,
  ad_group_criterion.status,
  ad_group_criterion.keyword.text
FROM keyword_view
WHERE ${keywordParentFilter}
  AND ad_group_criterion.negative = FALSE
  AND ad_group_criterion.status != 'REMOVED'`
  })
  if (positiveKeywords.more > 0) {
    return blocked('negative_keywords', 'policy_invalid', { code: 'positive_keyword_limit_exceeded' })
  }
  const positiveTerms = new Set(positiveKeywords.rows.map(row => (
    normalizeTerm(PositiveKeywordRowSchema.parse(row).adGroupCriterion.keyword.text)
  )))
  const protectedTerms = conditions.data.protectedTerms.map(normalizeTerm)
  const aggregated = new Map<string, z.infer<typeof SearchTermRowSchema>>()
  for (const rawRow of searchTerms.rows) {
    const row = SearchTermRowSchema.parse(rawRow)
    const key = normalizeTerm(row.searchTermView.searchTerm)
    const existing = aggregated.get(key)
    if (!existing) {
      aggregated.set(key, row)
      continue
    }
    existing.metrics.impressions += row.metrics.impressions
    existing.metrics.clicks += row.metrics.clicks
    existing.metrics.costMicros += row.metrics.costMicros
    existing.metrics.conversions += row.metrics.conversions
    if (row.searchTermView.status !== 'NONE') existing.searchTermView.status = row.searchTermView.status
  }
  const eligible = [...aggregated.values()]
    .filter(row => row.searchTermView.status === 'NONE')
    .filter(row => meetsThresholds(row.metrics, conditions.data))
    .filter((row) => {
      const term = normalizeTerm(row.searchTermView.searchTerm)
      return !positiveTerms.has(term)
        && !protectedTerms.some(protectedTerm => containsProtectedPhrase(term, protectedTerm))
    })
    .sort((left, right) => right.metrics.costMicros - left.metrics.costMicros
      || right.metrics.clicks - left.metrics.clicks
      || normalizeTerm(left.searchTermView.searchTerm).localeCompare(normalizeTerm(right.searchTermView.searchTerm)))
  const unique = [...new Map(eligible.map(row => [normalizeTerm(row.searchTermView.searchTerm), row])).values()]
    .slice(0, Math.min(conditions.data.maxAdditionsPerRun, conditions.data.maxKeywordsPerAction))
  if (unique.length === 0) {
    return blocked('negative_keywords', searchTerms.rows.length === 0 ? 'no_candidates' : 'threshold_not_met', {
      evaluated: searchTerms.rows.length,
      window: range
    })
  }
  const keywords = unique.map(row => ({
    text: row.searchTermView.searchTerm.trim().replace(/\s+/g, ' '),
    matchType: conditions.data.negativeMatchType
  }))
  const idempotencyKey = `policy:${grant.id}:${hashGoogleAdsValue({
    parent: input.parentResourceName,
    range,
    keywords
  }).slice(0, 40)}`
  const plan = await dependencies.plan({
    clientId: input.clientId,
    connectionId: input.connectionId,
    actorId: input.actorId,
    source: 'automation',
    operation: 'add_negative_keywords',
    resourceType: 'negative_keyword',
    requestedMode: 'automatic',
    arguments: {
      scope: input.scope,
      parentResourceName: input.parentResourceName,
      keywords
    },
    idempotencyKey
  }, authority, flags)
  await dependencies.event({
    planId: plan.id,
    clientId: input.clientId,
    actorId: input.actorId,
    eventType: 'automation_evaluated',
    metadata: {
      actionClass: 'negative_keywords',
      policyId: grant.id,
      policyVersion: grant.policyVersion,
      window: range,
      thresholds: {
        minImpressions: conditions.data.minImpressions,
        minClicks: conditions.data.minClicks,
        minSpendMicros: conditions.data.minSpendMicros,
        maxConversions: conditions.data.maxConversions
      },
      candidates: unique.map(row => ({
        text: row.searchTermView.searchTerm.trim().replace(/\s+/g, ' '),
        metrics: row.metrics
      }))
    }
  })
  if (plan.executionMode !== 'automatic' || !plan.policyDecision.allowed) {
    return blocked('negative_keywords', 'plan_blocked', { actionPlanId: plan.id })
  }
  const execution = await dependencies.execute(plan, authority, flags)
  return {
    actionClass: 'negative_keywords',
    executed: execution.ok,
    policyId: grant.id,
    policyVersion: grant.policyVersion,
    actionPlanId: plan.id,
    window: range,
    evaluated: searchTerms.rows.length,
    candidates: keywords.map(keyword => keyword.text),
    execution
  }
}

const PAUSE_RESOURCES = {
  campaign: { from: 'campaign', resource: 'campaign', field: 'campaign', operation: 'pause_campaign' },
  ad_group: { from: 'ad_group', resource: 'ad_group', field: 'adGroup', operation: 'pause_ad_group' },
  ad: { from: 'ad_group_ad', resource: 'ad_group_ad', field: 'adGroupAd', operation: 'pause_ad' },
  keyword: { from: 'keyword_view', resource: 'ad_group_criterion', field: 'adGroupCriterion', operation: 'pause_keyword' }
} as const

export async function runGoogleAdsPausePolicy(
  rawInput: unknown,
  authority: GoogleAdsControlAuthority,
  flags: GoogleAdsControlFlags,
  overrides: Partial<GoogleAdsAutomationRunnerDependencies> = {},
  now = new Date()
): Promise<Record<string, unknown>> {
  const input = PausePolicyInputSchema.parse(rawInput)
  if (!flags.write || !flags.automation || !authority.hasWriteScope) {
    return blocked('pause', 'feature_disabled')
  }
  const dependencies = { ...defaultDependencies, ...overrides }
  const session = await dependencies.resolveSession({
    clientId: input.clientId,
    connectionId: input.connectionId
  })
  if (customerIdFromResource(input.resourceName) !== session.connection.customerId) {
    throw new Error('Google Ads automation resource belongs to another customer')
  }
  const expectedSegment = {
    campaign: 'campaigns',
    ad_group: 'adGroups',
    ad: 'adGroupAds',
    keyword: 'adGroupCriteria'
  }[input.entityType]
  if (!input.resourceName.includes(`/${expectedSegment}/`)) {
    throw new Error('Google Ads automation entity type does not match its resource')
  }
  const grant = await dependencies.loadPolicy({
    clientId: input.clientId,
    connectionId: input.connectionId,
    customerId: session.connection.customerId,
    actionClass: 'pause'
  })
  if (!grant?.enabled) return blocked('pause', 'policy_missing')
  if (grant.maxDailyActions !== null && grant.actionsToday >= grant.maxDailyActions) {
    return blocked('pause', 'daily_cap')
  }
  const conditions = PausePolicyConditionsSchema.safeParse(grant.conditions)
  if (!conditions.success) return blocked('pause', 'policy_invalid')
  if (!conditions.data.allowedResourceTypes.includes(input.entityType)
    || !conditions.data.resourceNames.includes(input.resourceName)) {
    return blocked('pause', 'scope_blocked')
  }
  const config = PAUSE_RESOURCES[input.entityType]
  const recent = await dependencies.recentAction({
    clientId: input.clientId,
    connectionId: input.connectionId,
    customerId: session.connection.customerId,
    resourceName: input.resourceName,
    operations: [config.operation],
    cooldownHours: conditions.data.cooldownHours
  })
  if (recent) return blocked('pause', recent)
  const range = dateRange(conditions.data.lookbackDays, now)
  const result = await dependencies.query({
    customerId: session.connection.customerId,
    auth: session.auth,
    maxRows: 1,
    query: `SELECT ${config.resource}.resource_name,
  ${config.resource}.status,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions
FROM ${config.from}
WHERE ${config.resource}.resource_name = '${input.resourceName}'
  AND segments.date BETWEEN '${range.startDate}' AND '${range.endDate}'`
  })
  if (result.more > 0 || result.rows.length !== 1) {
    return blocked('pause', 'no_candidates', { window: range })
  }
  const row = z.object({
    [config.field]: z.object({
      resourceName: z.literal(input.resourceName),
      status: z.enum(['ENABLED', 'PAUSED', 'REMOVED'])
    }),
    metrics: MetricsSchema
  }).parse(result.rows[0]) as Record<string, unknown>
  const entity = row[config.field] as { resourceName: string, status: string }
  const metrics = MetricsSchema.parse(row.metrics)
  if (entity.status !== 'ENABLED' || !meetsThresholds(metrics, conditions.data)) {
    return blocked('pause', 'threshold_not_met', { window: range, metrics, status: entity.status })
  }
  const idempotencyKey = `policy:${grant.id}:${hashGoogleAdsValue({
    resourceName: input.resourceName,
    range,
    metrics
  }).slice(0, 40)}`
  const plan = await dependencies.plan({
    clientId: input.clientId,
    connectionId: input.connectionId,
    actorId: input.actorId,
    source: 'automation',
    operation: config.operation,
    resourceType: input.entityType,
    requestedMode: 'automatic',
    arguments: { resourceName: input.resourceName },
    idempotencyKey
  }, authority, flags)
  await dependencies.event({
    planId: plan.id,
    clientId: input.clientId,
    actorId: input.actorId,
    eventType: 'automation_evaluated',
    metadata: {
      actionClass: 'pause',
      policyId: grant.id,
      policyVersion: grant.policyVersion,
      resourceName: input.resourceName,
      window: range,
      thresholds: {
        minImpressions: conditions.data.minImpressions,
        minClicks: conditions.data.minClicks,
        minSpendMicros: conditions.data.minSpendMicros,
        maxConversions: conditions.data.maxConversions
      },
      metrics
    }
  })
  if (plan.executionMode !== 'automatic' || !plan.policyDecision.allowed) {
    return blocked('pause', 'plan_blocked', { actionPlanId: plan.id })
  }
  const execution = await dependencies.execute(plan, authority, flags)
  return {
    actionClass: 'pause',
    executed: execution.ok,
    policyId: grant.id,
    policyVersion: grant.policyVersion,
    actionPlanId: plan.id,
    window: range,
    metrics,
    execution
  }
}
