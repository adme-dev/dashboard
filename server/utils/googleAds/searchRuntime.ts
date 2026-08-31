import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { roleHasPermission } from '~~/server/utils/permissions'
import {
  planGoogleAdsAction,
  hashGoogleAdsValue,
  type PlanGoogleAdsActionInput
} from '~~/server/utils/googleAds/actionPlanner'
import {
  executeGoogleAdsAction,
  type GoogleAdsExecutionOutcome
} from '~~/server/utils/googleAds/actionExecutor'
import {
  appendGoogleAdsActionEvent,
  claimGoogleAdsActionPlan,
  completeGoogleAdsActionPlan,
  createGoogleAdsActionPlan,
  getGoogleAdsActionPlan
} from '~~/server/utils/googleAds/actionStore'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import {
  buildListingGroupProviderOperations,
  ExistingListingGroupFilterSchema,
  SemanticListingGroupNodeSchema
} from '~~/server/utils/googleAds/listingGroups'
import {
  googleAdsAutomaticActionClassForOperation,
  resolveGoogleAdsPolicy,
  type GoogleAdsAutomaticActionClass
} from '~~/server/utils/googleAds/policy'
import {
  resolveGoogleAdsControlSession,
  type ResolveGoogleAdsControlSessionInput
} from '~~/server/utils/googleAds/controlSession'
import {
  buildSearchGoogleAdsAction,
  isSearchGoogleAdsOperation
} from '~~/server/utils/googleAds/searchOperations'
import {
  loadSearchGoogleAdsCurrentState,
  loadSearchGoogleAdsPlanState,
  verifySearchGoogleAdsState
} from '~~/server/utils/googleAds/searchState'
import {
  mutateGoogleAds,
  type MutateGoogleAdsInput
} from '~~/server/utils/googleAds/mutate'
import { GoogleAdsActionError, normalizeGoogleAdsError } from '~~/server/utils/googleAds/errors'

export interface GoogleAdsControlAuthority {
  actorRole: string
  hasWriteScope: boolean
}

export interface GoogleAdsControlFlags {
  read: boolean
  write: boolean
  automation: boolean
  destructive: boolean
}

export interface GoogleAdsAutomationPolicyGrant {
  id: string
  actionClass: GoogleAdsAutomaticActionClass
  policyVersion: string
  enabled: boolean
  conditions: Record<string, unknown>
  maxDailyActions: number | null
  actionsToday: number
}

interface LoadAutomationPolicyInput {
  clientId: string
  connectionId: string
  customerId: string
  actionClass: GoogleAdsAutomaticActionClass
}

const AutomationPolicyRowSchema = z.object({
  id: z.string().uuid(),
  actionClass: z.enum(['negative_keywords', 'pause', 'recommendation_dismissal', 'asset_detachment']),
  policyVersion: z.string().min(1).max(255),
  enabled: z.boolean(),
  conditions: z.record(z.string(), z.unknown()),
  maxDailyActions: z.number().int().positive().nullable(),
  actionsToday: z.number().int().nonnegative()
}).required()

interface LoadGoogleAdsAutomationPolicyDependencies {
  queryOne(sql: string, params: unknown[]): Promise<unknown>
}

const defaultLoadAutomationPolicyDependencies: LoadGoogleAdsAutomationPolicyDependencies = {
  queryOne
}

export async function loadGoogleAdsAutomationPolicy(
  input: LoadAutomationPolicyInput,
  dependencies: LoadGoogleAdsAutomationPolicyDependencies = defaultLoadAutomationPolicyDependencies
): Promise<GoogleAdsAutomationPolicyGrant | null> {
  const rawRow = await dependencies.queryOne(`
    SELECT
      p.id,
      p.action_class AS "actionClass",
      p.policy_version AS "policyVersion",
      p.enabled,
      p.conditions,
      p.max_daily_actions AS "maxDailyActions",
      COALESCE((
        SELECT COUNT(*)::int
        FROM (
          SELECT reservation.plan_id
          FROM google_ads_automation_quota_reservations reservation
          WHERE reservation.grant_id = p.id
            AND reservation.quota_day = (NOW() AT TIME ZONE 'UTC')::date
          UNION
          SELECT plan.id
          FROM google_ads_action_plans plan
          WHERE plan.grant_id = p.id::text
            AND plan.status IN ('verified', 'partially_verified')
            AND plan.completed_at >= (
              (NOW() AT TIME ZONE 'UTC')::date AT TIME ZONE 'UTC'
            )
            AND NOT EXISTS (
              SELECT 1
              FROM google_ads_automation_quota_reservations existing
              WHERE existing.plan_id = plan.id
            )
        ) used_actions
      ), 0)::int AS "actionsToday"
    FROM google_ads_automation_policies p
    WHERE p.client_id = $1
      AND p.connection_id = $2
      AND p.customer_id = $3
      AND p.action_class = $4
      AND p.enabled = true
      AND p.superseded_at IS NULL
      AND p.effective_at <= NOW()
    ORDER BY p.version DESC
    LIMIT 1
  `, [input.clientId, input.connectionId, input.customerId, input.actionClass])
  return rawRow
    ? AutomationPolicyRowSchema.parse(rawRow) as GoogleAdsAutomationPolicyGrant
    : null
}

export interface SearchGoogleAdsPlanningDependencies {
  resolveSession(input: ResolveGoogleAdsControlSessionInput): ReturnType<typeof resolveGoogleAdsControlSession>
  loadCurrent: typeof loadSearchGoogleAdsCurrentState
  loadAutomationPolicy(input: LoadAutomationPolicyInput): Promise<GoogleAdsAutomationPolicyGrant | null>
  persist(plan: GoogleAdsActionPlan): Promise<GoogleAdsActionPlan>
  event(input: Parameters<typeof appendGoogleAdsActionEvent>[0]): Promise<unknown>
  now?: () => Date
  randomUUID?: () => string
}

const defaultPlanningDependencies: SearchGoogleAdsPlanningDependencies = {
  resolveSession: resolveGoogleAdsControlSession,
  loadCurrent: loadSearchGoogleAdsCurrentState,
  loadAutomationPolicy: loadGoogleAdsAutomationPolicy,
  persist: createGoogleAdsActionPlan,
  event: appendGoogleAdsActionEvent
}

function activeGrant(grant: GoogleAdsAutomationPolicyGrant | null): boolean {
  if (!grant?.enabled) return false
  return grant.maxDailyActions === null || grant.actionsToday < grant.maxDailyActions
}

const NegativeAutomationConditionsSchema = z.strictObject({
  maxKeywordsPerAction: z.number().int().min(1).max(100).optional(),
  allowedMatchTypes: z.array(z.enum(['EXACT', 'PHRASE', 'BROAD'])).min(1).max(3).optional(),
  allowedScopes: z.array(z.enum(['campaign', 'ad_group'])).min(1).max(2).optional(),
  resourceNames: z.array(z.string().min(1).max(1_000)).min(1).max(1_000).optional(),
  protectedTerms: z.array(z.string().trim().min(1).max(80)).max(1_000).optional(),
  minImpressions: z.number().int().min(0).optional(),
  minClicks: z.number().int().min(0).optional(),
  minSpendMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  maxConversions: z.number().finite().min(0).optional(),
  negativeMatchType: z.enum(['EXACT', 'PHRASE', 'BROAD']).optional(),
  maxAdditionsPerRun: z.number().int().min(1).max(100).optional(),
  lookbackDays: z.number().int().min(1).max(90).optional(),
  cooldownHours: z.number().int().min(1).max(24 * 90).optional()
})
const NegativeAutomationArgumentsSchema = z.object({
  scope: z.enum(['campaign', 'ad_group']),
  parentResourceName: z.string(),
  keywords: z.array(z.object({
    text: z.string(),
    matchType: z.enum(['EXACT', 'PHRASE', 'BROAD'])
  }))
})
const PauseAutomationConditionsSchema = z.strictObject({
  allowedResourceTypes: z.array(z.enum(['campaign', 'ad_group', 'ad', 'keyword'])).min(1).max(4).optional(),
  resourceNames: z.array(z.string().min(1).max(1_000)).min(1).max(1_000).optional(),
  minImpressions: z.number().int().min(0).optional(),
  minClicks: z.number().int().min(0).optional(),
  minSpendMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  maxConversions: z.number().finite().min(0).optional(),
  lookbackDays: z.number().int().min(1).max(90).optional(),
  cooldownHours: z.number().int().min(1).max(24 * 90).optional()
})
const PauseAutomationArgumentsSchema = z.object({ resourceName: z.string() })
const AssetDetachmentConditionsSchema = z.strictObject({
  allowedScopes: z.array(z.enum(['customer', 'campaign', 'ad_group'])).min(1).max(3).optional(),
  resourceNames: z.array(z.string().min(1).max(1_000)).min(1).max(1_000).optional()
})
const AssetDetachmentArgumentsSchema = z.object({
  scope: z.enum(['customer', 'campaign', 'ad_group']),
  resourceName: z.string()
})

function automationConditionsAllow(
  input: PlanGoogleAdsActionInput,
  grant: GoogleAdsAutomationPolicyGrant | null
): boolean {
  if (!grant) return false
  if (grant.actionClass === 'negative_keywords') {
    const conditions = NegativeAutomationConditionsSchema.safeParse(grant.conditions)
    const args = NegativeAutomationArgumentsSchema.safeParse(input.arguments)
    if (!conditions.success || !args.success) return false
    if (conditions.data.maxKeywordsPerAction !== undefined
      && args.data.keywords.length > conditions.data.maxKeywordsPerAction) return false
    if (conditions.data.allowedMatchTypes
      && args.data.keywords.some(keyword => !conditions.data.allowedMatchTypes?.includes(keyword.matchType))) return false
    if (conditions.data.allowedScopes && !conditions.data.allowedScopes.includes(args.data.scope)) return false
    if (conditions.data.resourceNames
      && !conditions.data.resourceNames.includes(args.data.parentResourceName)) return false
    const evidenceBound = conditions.data.minImpressions !== undefined
      || conditions.data.minClicks !== undefined
      || conditions.data.minSpendMicros !== undefined
      || conditions.data.maxConversions !== undefined
      || conditions.data.lookbackDays !== undefined
      || conditions.data.cooldownHours !== undefined
    if (evidenceBound && input.source !== 'automation') return false
    if (conditions.data.maxAdditionsPerRun !== undefined
      && args.data.keywords.length > conditions.data.maxAdditionsPerRun) return false
    if (conditions.data.negativeMatchType !== undefined
      && args.data.keywords.some(keyword => keyword.matchType !== conditions.data.negativeMatchType)) return false
    if (conditions.data.protectedTerms) {
      const protectedTerms = conditions.data.protectedTerms.map(term => (
        ` ${term.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-AU')} `
      ))
      if (args.data.keywords.some((keyword) => {
        const term = ` ${keyword.text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-AU')} `
        return protectedTerms.some(protectedTerm => term.includes(protectedTerm))
      })) return false
    }
    return true
  }
  if (grant.actionClass === 'pause') {
    const conditions = PauseAutomationConditionsSchema.safeParse(grant.conditions)
    const args = PauseAutomationArgumentsSchema.safeParse(input.arguments)
    if (!conditions.success || !args.success) return false
    if (conditions.data.allowedResourceTypes
      && !conditions.data.allowedResourceTypes.includes(input.resourceType as never)) return false
    if (conditions.data.resourceNames && !conditions.data.resourceNames.includes(args.data.resourceName)) return false
    const evidenceBound = conditions.data.minImpressions !== undefined
      || conditions.data.minClicks !== undefined
      || conditions.data.minSpendMicros !== undefined
      || conditions.data.maxConversions !== undefined
      || conditions.data.lookbackDays !== undefined
      || conditions.data.cooldownHours !== undefined
    if (evidenceBound && input.source !== 'automation') return false
    return true
  }
  if (grant.actionClass === 'asset_detachment') {
    const conditions = AssetDetachmentConditionsSchema.safeParse(grant.conditions)
    const args = AssetDetachmentArgumentsSchema.safeParse(input.arguments)
    if (!conditions.success || !args.success) return false
    if (conditions.data.allowedScopes && !conditions.data.allowedScopes.includes(args.data.scope)) return false
    if (conditions.data.resourceNames && !conditions.data.resourceNames.includes(args.data.resourceName)) return false
    return true
  }
  return Object.keys(grant.conditions).length === 0
}

export async function planSearchGoogleAdsControlAction(
  input: PlanGoogleAdsActionInput,
  authority: GoogleAdsControlAuthority,
  flags: GoogleAdsControlFlags,
  overrides: Partial<SearchGoogleAdsPlanningDependencies> = {}
): Promise<GoogleAdsActionPlan> {
  const dependencies = { ...defaultPlanningDependencies, ...overrides }
  const session = await dependencies.resolveSession({
    clientId: input.clientId,
    connectionId: input.connectionId
  })
  const actionClass = googleAdsAutomaticActionClassForOperation(input.operation)
  const grant = input.requestedMode === 'automatic' && actionClass
    ? await dependencies.loadAutomationPolicy({
        clientId: input.clientId,
        connectionId: input.connectionId,
        customerId: session.connection.customerId,
        actionClass
      })
    : null
  const grantActive = activeGrant(grant) && automationConditionsAllow(input, grant)

  const plan = await planGoogleAdsAction(input, {
    resolveConnection: async () => session.connection,
    loadCurrent: context => dependencies.loadCurrent(context, session.auth),
    buildAction: async context => buildSearchGoogleAdsAction(context),
    resolvePolicy: () => resolveGoogleAdsPolicy({
      operation: input.operation,
      actorRole: authority.actorRole,
      hasMediaPermission: roleHasPermission(authority.actorRole, 'MEDIA_BUYING'),
      hasElevatedPermission: roleHasPermission(authority.actorRole, 'MANAGEMENT'),
      hasWriteScope: authority.hasWriteScope,
      globalWriteEnabled: flags.write,
      automationEnabled: flags.automation,
      destructiveEnabled: flags.destructive,
      requestedMode: input.requestedMode,
      accountPolicy: input.requestedMode === 'proposal'
        ? { enabled: true }
        : {
            enabled: grantActive,
            actionClass: grantActive ? grant?.actionClass : undefined
          }
    }),
    persist: dependencies.persist,
    policyVersion: grantActive && grant ? grant.policyVersion : 'google-ads-v1',
    grantId: grantActive && grant ? grant.id : null,
    now: dependencies.now,
    randomUUID: dependencies.randomUUID
  })

  await dependencies.event({
    planId: plan.id,
    clientId: plan.clientId,
    actorId: plan.actorId,
    eventType: 'planned',
    metadata: {
      operation: plan.operation,
      riskTier: plan.riskTier,
      executionMode: plan.executionMode,
      policyVersion: plan.policyVersion,
      policyCode: plan.policyDecision.code ?? null,
      ...(input.arguments && typeof input.arguments === 'object'
        && typeof (input.arguments as { reason?: unknown }).reason === 'string'
        ? { reason: (input.arguments as { reason: string }).reason }
        : {})
    }
  })
  return plan
}

export interface SearchGoogleAdsExecutionDependencies {
  resolveSession(input: ResolveGoogleAdsControlSessionInput): ReturnType<typeof resolveGoogleAdsControlSession>
  loadPlan: typeof getGoogleAdsActionPlan
  loadPlanState: typeof loadSearchGoogleAdsPlanState
  loadAutomationPolicy(input: LoadAutomationPolicyInput): Promise<GoogleAdsAutomationPolicyGrant | null>
  mutate(input: MutateGoogleAdsInput): ReturnType<typeof mutateGoogleAds>
  claim: typeof claimGoogleAdsActionPlan
  event: typeof appendGoogleAdsActionEvent
  complete: typeof completeGoogleAdsActionPlan
}

const defaultExecutionDependencies: SearchGoogleAdsExecutionDependencies = {
  resolveSession: resolveGoogleAdsControlSession,
  loadPlan: getGoogleAdsActionPlan,
  loadPlanState: loadSearchGoogleAdsPlanState,
  loadAutomationPolicy: loadGoogleAdsAutomationPolicy,
  mutate: mutateGoogleAds,
  claim: claimGoogleAdsActionPlan,
  event: appendGoogleAdsActionEvent,
  complete: completeGoogleAdsActionPlan
}

const EXECUTABLE_SEARCH_SERVICES = {
  pause_campaign: ['campaigns'],
  archive_campaign: ['campaigns'],
  enable_campaign: ['campaigns'],
  set_campaign_status: ['campaigns'],
  pause_ad_group: ['adGroups'],
  archive_ad_group: ['adGroups'],
  enable_ad_group: ['adGroups'],
  set_ad_group_status: ['adGroups'],
  pause_ad: ['adGroupAds'],
  archive_ad: ['adGroupAds'],
  enable_ad: ['adGroupAds'],
  update_ad_status: ['adGroupAds'],
  pause_keyword: ['adGroupCriteria'],
  enable_keyword: ['adGroupCriteria'],
  set_keyword_status: ['adGroupCriteria'],
  remove_campaign: ['campaigns'],
  remove_ad_group: ['adGroups'],
  remove_ad: ['adGroupAds'],
  remove_keyword: ['adGroupCriteria'],
  add_negative_keywords: ['campaignCriteria', 'adGroupCriteria'],
  remove_negative_keyword: ['campaignCriteria', 'adGroupCriteria'],
  manage_shared_negative_set: ['googleAds'],
  create_budget: ['campaignBudgets'],
  update_budget: ['campaignBudgets'],
  create_campaign: ['campaigns'],
  update_campaign: ['campaigns'],
  create_bidding_strategy: ['biddingStrategies'],
  update_bidding: ['biddingStrategies'],
  create_ad_group: ['adGroups'],
  update_ad_group: ['adGroups'],
  create_ad: ['adGroupAds'],
  replace_ad: ['adGroupAds'],
  add_keywords: ['adGroupCriteria'],
  update_keyword: ['adGroupCriteria'],
  set_locations: ['campaignCriteria'],
  set_location_match_mode: ['campaigns'],
  set_languages: ['campaignCriteria'],
  set_ad_schedule: ['campaignCriteria'],
  set_devices: ['campaignCriteria'],
  set_demographics: ['adGroupCriteria'],
  set_placements: ['campaignCriteria', 'adGroupCriteria'],
  set_content_exclusions: ['campaignCriteria'],
  set_audience_associations: ['adGroups', 'adGroupCriteria'],
  manage_custom_audience: ['customAudiences'],
  archive_custom_audience: ['customAudiences'],
  set_pmax_signals: ['assetGroupSignals'],
  set_search_themes: ['assetGroupSignals'],
  set_campaign_conversion_goals: ['campaignConversionGoals'],
  set_conversion_goal: ['conversionGoalCampaignConfigs'],
  set_customer_goal_biddability: ['customerConversionGoals'],
  set_conversion_primary_state: ['conversionActions'],
  create_conversion_action: ['conversionActions'],
  update_conversion_action: ['conversionActions'],
  archive_conversion_action: ['conversionActions'],
  remove_conversion_action: ['conversionActions'],
  create_custom_conversion_goal: ['customConversionGoals'],
  update_custom_conversion_goal: ['customConversionGoals'],
  archive_custom_conversion_goal: ['customConversionGoals'],
  create_asset: ['assets'],
  attach_asset: ['customerAssets', 'campaignAssets', 'adGroupAssets'],
  archive_asset_link: ['customerAssets', 'campaignAssets', 'adGroupAssets'],
  detach_asset: ['customerAssets', 'campaignAssets', 'adGroupAssets'],
  create_asset_group: ['googleAds'],
  update_asset_group: ['assetGroups'],
  manage_asset_group_assets: ['assetGroupAssets'],
  manage_listing_groups: ['googleAds'],
  apply_recommendation: ['recommendationsApply'],
  dismiss_recommendation: ['recommendationsDismiss']
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKey(value: Record<string, unknown>, key: string): boolean {
  return Object.keys(value).length === 1 && Object.hasOwn(value, key)
}

function isTypedAssetGroupCreateBundle(plan: GoogleAdsActionPlan): boolean {
  const desired = z.object({
    campaign: z.string().regex(/^customers\/\d+\/campaigns\/\d+$/),
    assets: z.array(z.object({
      fieldType: z.enum([
        'HEADLINE', 'LONG_HEADLINE', 'DESCRIPTION', 'MARKETING_IMAGE',
        'SQUARE_MARKETING_IMAGE', 'BUSINESS_NAME', 'LOGO', 'PORTRAIT_MARKETING_IMAGE',
        'LANDSCAPE_LOGO', 'YOUTUBE_VIDEO', 'CALL_TO_ACTION_SELECTION', 'MEDIA_BUNDLE'
      ]),
      assetResourceName: z.string().regex(/^customers\/\d+\/assets\/\d+$/)
    }))
  }).safeParse(plan.desiredState)
  if (!desired.success || plan.providerOperations.length !== 1) return false
  if (!desired.data.campaign.startsWith(`customers/${plan.customerId}/campaigns/`)) return false
  const mutation = plan.providerOperations[0]
  if (!mutation || mutation.service !== 'googleAds'
    || mutation.operations.length !== desired.data.assets.length + 1) return false
  const customerPrefix = desired.data.campaign.slice(0, desired.data.campaign.indexOf('/campaigns/'))
  if (!desired.data.assets.every(asset => asset.assetResourceName.startsWith(`${customerPrefix}/assets/`))) return false
  const temporaryResourceName = `${customerPrefix}/assetGroups/-1`

  const first = mutation.operations[0]
  if (!first || !('mutate' in first) || !isRecord(first.mutate)
    || !hasOnlyKey(first.mutate, 'assetGroupOperation')) return false
  const assetGroupOperation = first.mutate.assetGroupOperation
  if (!isRecord(assetGroupOperation) || !hasOnlyKey(assetGroupOperation, 'create')
    || !isRecord(assetGroupOperation.create)) return false
  if (assetGroupOperation.create.resourceName !== temporaryResourceName
    || assetGroupOperation.create.campaign !== desired.data.campaign
    || assetGroupOperation.create.status !== 'PAUSED') return false

  return desired.data.assets.every((asset, index) => {
    const operation = mutation.operations[index + 1]
    if (!operation || !('mutate' in operation) || !isRecord(operation.mutate)
      || !hasOnlyKey(operation.mutate, 'assetGroupAssetOperation')) return false
    const assetOperation = operation.mutate.assetGroupAssetOperation
    if (!isRecord(assetOperation) || !hasOnlyKey(assetOperation, 'create')
      || !isRecord(assetOperation.create)) return false
    return assetOperation.create.assetGroup === temporaryResourceName
      && assetOperation.create.asset === asset.assetResourceName
      && assetOperation.create.fieldType === asset.fieldType
  })
}

const ASSET_GROUP_UPDATE_FIELDS = {
  name: 'name',
  final_urls: 'finalUrls',
  final_mobile_urls: 'finalMobileUrls',
  path1: 'path1',
  path2: 'path2',
  status: 'status'
} as const

function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isTypedAssetGroupUpdate(plan: GoogleAdsActionPlan): boolean {
  const desired = z.object({
    resourceName: z.string(),
    name: z.string(),
    finalUrls: z.array(z.string()),
    finalMobileUrls: z.array(z.string()),
    path1: z.string().optional(),
    path2: z.string().optional(),
    status: z.enum(['ENABLED', 'PAUSED'])
  }).safeParse(plan.desiredState)
  if (!desired.success
    || desired.data.resourceName.match(/^customers\/(\d+)\/assetGroups\/\d+$/)?.[1] !== plan.customerId
    || plan.providerOperations.length !== 1) return false
  const mutation = plan.providerOperations[0]
  if (!mutation || mutation.service !== 'assetGroups' || mutation.operations.length !== 1) return false
  const operation = mutation.operations[0]
  if (!operation || !('update' in operation) || !isRecord(operation.update)
    || operation.update.resourceName !== desired.data.resourceName) return false
  const mask = operation.updateMask.split(',').map(field => field.trim()).filter(Boolean)
  if (mask.length === 0 || new Set(mask).size !== mask.length
    || mask.some(field => !Object.hasOwn(ASSET_GROUP_UPDATE_FIELDS, field))) return false
  const allowedUpdateKeys = new Set([
    'resourceName',
    ...mask.map(field => ASSET_GROUP_UPDATE_FIELDS[field as keyof typeof ASSET_GROUP_UPDATE_FIELDS])
  ])
  if (Object.keys(operation.update).some(key => !allowedUpdateKeys.has(key))) return false
  return mask.every((field) => {
    const key = ASSET_GROUP_UPDATE_FIELDS[field as keyof typeof ASSET_GROUP_UPDATE_FIELDS]
    return equalJson(operation.update[key], desired.data[key])
  })
}

const RuntimePmaxAssetLinkSchema = z.object({
  fieldType: z.enum([
    'HEADLINE', 'LONG_HEADLINE', 'DESCRIPTION', 'MARKETING_IMAGE',
    'SQUARE_MARKETING_IMAGE', 'BUSINESS_NAME', 'LOGO', 'PORTRAIT_MARKETING_IMAGE',
    'LANDSCAPE_LOGO', 'YOUTUBE_VIDEO', 'CALL_TO_ACTION_SELECTION', 'MEDIA_BUNDLE'
  ]),
  assetResourceName: z.string()
})

function runtimeAssetLinkKey(link: z.infer<typeof RuntimePmaxAssetLinkSchema>): string {
  return `${link.fieldType}:${link.assetResourceName}`
}

function isTypedAssetGroupMembership(plan: GoogleAdsActionPlan): boolean {
  const desired = z.object({
    assetGroupResourceName: z.string(),
    assets: z.array(RuntimePmaxAssetLinkSchema)
  }).safeParse(plan.desiredState)
  const current = z.object({
    assetGroup: z.object({
      resourceName: z.string(),
      assets: z.array(RuntimePmaxAssetLinkSchema)
    })
  }).safeParse(plan.currentState)
  if (!desired.success || !current.success || plan.providerOperations.length !== 1) return false
  const customerPrefix = `customers/${plan.customerId}`
  const groupMatch = desired.data.assetGroupResourceName.match(/^customers\/(\d+)\/assetGroups\/(\d+)$/)
  if (!groupMatch || groupMatch[1] !== plan.customerId
    || current.data.assetGroup.resourceName !== desired.data.assetGroupResourceName) return false
  const allLinks = [...desired.data.assets, ...current.data.assetGroup.assets]
  if (!allLinks.every(link => link.assetResourceName.startsWith(`${customerPrefix}/assets/`))) return false
  const desiredKeys = new Set(desired.data.assets.map(runtimeAssetLinkKey))
  const currentKeys = new Set(current.data.assetGroup.assets.map(runtimeAssetLinkKey))
  const creates = desired.data.assets
    .filter(link => !currentKeys.has(runtimeAssetLinkKey(link)))
    .sort((left, right) => runtimeAssetLinkKey(left).localeCompare(runtimeAssetLinkKey(right)))
    .map(link => ({ create: {
      assetGroup: desired.data.assetGroupResourceName,
      asset: link.assetResourceName,
      fieldType: link.fieldType
    } }))
  const removes = current.data.assetGroup.assets
    .filter(link => !desiredKeys.has(runtimeAssetLinkKey(link)))
    .sort((left, right) => runtimeAssetLinkKey(left).localeCompare(runtimeAssetLinkKey(right)))
    .map((link) => {
      const assetId = link.assetResourceName.slice(link.assetResourceName.lastIndexOf('/') + 1)
      return { remove: `${customerPrefix}/assetGroupAssets/${groupMatch[2]}~${assetId}~${link.fieldType}` }
    })
  const mutation = plan.providerOperations[0]
  return Boolean(mutation && mutation.service === 'assetGroupAssets'
    && equalJson(mutation.operations, [...creates, ...removes]))
}

function isTypedListingGroupReplacement(plan: GoogleAdsActionPlan): boolean {
  const desired = z.object({
    assetGroupResourceName: z.string(),
    nodes: z.array(SemanticListingGroupNodeSchema).min(1).max(1_000)
  }).safeParse(plan.desiredState)
  const current = z.object({
    assetGroup: z.object({ resourceName: z.string() }),
    filters: z.array(ExistingListingGroupFilterSchema)
  }).safeParse(plan.currentState)
  if (!desired.success || !current.success || plan.providerOperations.length !== 1
    || current.data.assetGroup.resourceName !== desired.data.assetGroupResourceName) return false
  let expected
  try {
    expected = buildListingGroupProviderOperations({
      customerId: plan.customerId,
      assetGroupResourceName: desired.data.assetGroupResourceName,
      desiredNodes: desired.data.nodes,
      existingFilters: current.data.filters
    })
  } catch {
    return false
  }
  const mutation = plan.providerOperations[0]
  return Boolean(mutation && mutation.service === 'googleAds'
    && mutation.atomicity === 'interdependent'
    && mutation.partialFailure === false
    && equalJson(mutation.operations, expected))
}

function isTypedRecommendationMutation(plan: GoogleAdsActionPlan): boolean {
  const stateSchema = z.object({
    resourceName: z.string(),
    type: z.string().min(1),
    dismissed: z.boolean(),
    campaign: z.string().optional(),
    campaigns: z.array(z.string()),
    adGroup: z.string().optional(),
    campaignBudget: z.string().optional(),
    recommendedBudgetAmountMicros: z.string().optional()
  })
  const current = stateSchema.safeParse(plan.currentState)
  if (!current.success || current.data.dismissed || plan.providerOperations.length !== 1) return false
  const match = current.data.resourceName.match(/^customers\/(\d+)\/recommendations\/[A-Za-z0-9_-]+$/)
  if (!match || match[1] !== plan.customerId || plan.resourceName !== current.data.resourceName) return false
  const targets = [
    current.data.campaign,
    current.data.adGroup,
    current.data.campaignBudget,
    ...current.data.campaigns
  ].filter((target): target is string => Boolean(target))
  if (targets.some(target => !target.startsWith(`customers/${plan.customerId}/`))) return false
  const disposition = plan.operation === 'apply_recommendation' ? 'APPLIED' : 'DISMISSED'
  if (!equalJson(plan.desiredState, {
    ...current.data,
    dismissed: disposition === 'DISMISSED',
    disposition
  })) return false
  const mutation = plan.providerOperations[0]
  const service = disposition === 'APPLIED' ? 'recommendationsApply' : 'recommendationsDismiss'
  return Boolean(mutation && mutation.service === service
    && mutation.atomicity === 'interdependent'
    && mutation.partialFailure === false
    && equalJson(mutation.operations, [{ recommendation: { resourceName: current.data.resourceName } }]))
}

const RuntimeMicrosSchema = z.string().regex(/^\d+$/).refine(value => BigInt(value) > 0n)
const RuntimeRoasSchema = z.number().finite().min(0.01).max(1_000)
const RuntimeBidLimitsSchema = {
  cpcBidCeilingMicros: RuntimeMicrosSchema.optional(),
  cpcBidFloorMicros: RuntimeMicrosSchema.optional()
}
const RuntimeBiddingStrategyCreateSchema = z.union([
  z.strictObject({
    name: z.string().trim().min(1).max(255),
    targetCpa: z.strictObject({ targetCpaMicros: RuntimeMicrosSchema, ...RuntimeBidLimitsSchema })
  }),
  z.strictObject({
    name: z.string().trim().min(1).max(255),
    targetRoas: z.strictObject({ targetRoas: RuntimeRoasSchema, ...RuntimeBidLimitsSchema })
  }),
  z.strictObject({
    name: z.string().trim().min(1).max(255),
    targetSpend: z.strictObject({ cpcBidCeilingMicros: RuntimeMicrosSchema.optional() })
  }),
  z.strictObject({
    name: z.string().trim().min(1).max(255),
    targetImpressionShare: z.strictObject({
      location: z.enum(['ANYWHERE_ON_PAGE', 'TOP_OF_PAGE', 'ABSOLUTE_TOP_OF_PAGE']),
      locationFractionMicros: RuntimeMicrosSchema.refine(value => BigInt(value) <= 1_000_000n),
      cpcBidCeilingMicros: RuntimeMicrosSchema
    })
  }),
  z.strictObject({
    name: z.string().trim().min(1).max(255),
    maximizeConversions: z.strictObject({
      targetCpaMicros: RuntimeMicrosSchema.optional(),
      ...RuntimeBidLimitsSchema
    })
  }),
  z.strictObject({
    name: z.string().trim().min(1).max(255),
    maximizeConversionValue: z.strictObject({
      targetRoas: RuntimeRoasSchema.optional(),
      ...RuntimeBidLimitsSchema
    })
  })
])

const BIDDING_STRATEGY_SCHEME_BY_TYPE = {
  TARGET_CPA: 'targetCpa',
  TARGET_ROAS: 'targetRoas',
  TARGET_SPEND: 'targetSpend',
  TARGET_IMPRESSION_SHARE: 'targetImpressionShare',
  MAXIMIZE_CONVERSIONS: 'maximizeConversions',
  MAXIMIZE_CONVERSION_VALUE: 'maximizeConversionValue'
} as const
type RuntimeBiddingStrategyType = keyof typeof BIDDING_STRATEGY_SCHEME_BY_TYPE

const BIDDING_STRATEGY_UPDATE_FIELDS: Record<RuntimeBiddingStrategyType, Record<string, readonly string[]>> = {
  TARGET_CPA: {
    'name': ['name'],
    'target_cpa.target_cpa_micros': ['targetCpa', 'targetCpaMicros'],
    'target_cpa.cpc_bid_ceiling_micros': ['targetCpa', 'cpcBidCeilingMicros'],
    'target_cpa.cpc_bid_floor_micros': ['targetCpa', 'cpcBidFloorMicros']
  },
  TARGET_ROAS: {
    'name': ['name'],
    'target_roas.target_roas': ['targetRoas', 'targetRoas'],
    'target_roas.cpc_bid_ceiling_micros': ['targetRoas', 'cpcBidCeilingMicros'],
    'target_roas.cpc_bid_floor_micros': ['targetRoas', 'cpcBidFloorMicros']
  },
  TARGET_SPEND: {
    'name': ['name'],
    'target_spend.cpc_bid_ceiling_micros': ['targetSpend', 'cpcBidCeilingMicros']
  },
  TARGET_IMPRESSION_SHARE: {
    'name': ['name'],
    'target_impression_share.location': ['targetImpressionShare', 'location'],
    'target_impression_share.location_fraction_micros': ['targetImpressionShare', 'locationFractionMicros'],
    'target_impression_share.cpc_bid_ceiling_micros': ['targetImpressionShare', 'cpcBidCeilingMicros']
  },
  MAXIMIZE_CONVERSIONS: {
    'name': ['name'],
    'maximize_conversions.target_cpa_micros': ['maximizeConversions', 'targetCpaMicros'],
    'maximize_conversions.cpc_bid_ceiling_micros': ['maximizeConversions', 'cpcBidCeilingMicros'],
    'maximize_conversions.cpc_bid_floor_micros': ['maximizeConversions', 'cpcBidFloorMicros']
  },
  MAXIMIZE_CONVERSION_VALUE: {
    'name': ['name'],
    'maximize_conversion_value.target_roas': ['maximizeConversionValue', 'targetRoas'],
    'maximize_conversion_value.cpc_bid_ceiling_micros': ['maximizeConversionValue', 'cpcBidCeilingMicros'],
    'maximize_conversion_value.cpc_bid_floor_micros': ['maximizeConversionValue', 'cpcBidFloorMicros']
  }
}

function hasValidRuntimeBidLimits(value: unknown): boolean {
  if (!isRecord(value)) return false
  const floor = value.cpcBidFloorMicros
  const ceiling = value.cpcBidCeilingMicros
  return !(typeof floor === 'string' && typeof ceiling === 'string'
    && BigInt(floor) > BigInt(ceiling))
}

function setPathValue(target: Record<string, unknown>, path: readonly string[], value: unknown): boolean {
  if (path.length === 1) {
    target[path[0]!] = value
    return true
  }
  const parent = target[path[0]!]
  if (!isRecord(parent)) return false
  parent[path[1]!] = value
  return true
}

function isTypedBiddingStrategyMutation(plan: GoogleAdsActionPlan): boolean {
  if (plan.providerOperations.length !== 1) return false
  const mutation = plan.providerOperations[0]
  if (!mutation || mutation.service !== 'biddingStrategies'
    || mutation.atomicity !== 'interdependent'
    || mutation.partialFailure !== false
    || mutation.operations.length !== 1) return false
  const operation = mutation.operations[0]
  if (!operation) return false
  if (plan.operation === 'create_bidding_strategy') {
    const desired = RuntimeBiddingStrategyCreateSchema.safeParse(plan.desiredState)
    const scheme = desired.success
      ? Object.keys(BIDDING_STRATEGY_SCHEME_BY_TYPE)
          .map(type => BIDDING_STRATEGY_SCHEME_BY_TYPE[type as RuntimeBiddingStrategyType])
          .find(key => Object.hasOwn(desired.data, key))
      : undefined
    return desired.success
      && Boolean(scheme && hasValidRuntimeBidLimits(
        (desired.data as Record<string, unknown>)[scheme!]
      ))
      && plan.resourceName === null
      && equalJson(plan.currentState, { exists: false })
      && 'create' in operation
      && equalJson(operation.create, desired.data)
  }
  if (plan.operation !== 'update_bidding' || !plan.resourceName
    || !new RegExp(`^customers/${plan.customerId}/biddingStrategies/\\d+$`).test(plan.resourceName)
    || !isRecord(plan.currentState) || !isRecord(plan.desiredState)
    || !('update' in operation) || !isRecord(operation.update)
    || operation.update.resourceName !== plan.resourceName) return false
  const type = plan.currentState.type
  if (typeof type !== 'string' || !Object.hasOwn(BIDDING_STRATEGY_SCHEME_BY_TYPE, type)
    || plan.desiredState.type !== type
    || plan.currentState.resourceName !== plan.resourceName
    || plan.desiredState.resourceName !== plan.resourceName) return false
  const fields = BIDDING_STRATEGY_UPDATE_FIELDS[type as RuntimeBiddingStrategyType]
  const scheme = BIDDING_STRATEGY_SCHEME_BY_TYPE[type as RuntimeBiddingStrategyType]
  const masks = operation.updateMask.split(',').map(mask => mask.trim()).filter(Boolean)
  if (masks.length === 0 || new Set(masks).size !== masks.length
    || masks.some(mask => !Object.hasOwn(fields, mask))) return false
  const allowedTopLevel = new Set(['resourceName'])
  const expectedDesired = structuredClone(plan.currentState)
  for (const mask of masks) {
    const path = fields[mask]
    if (!path) return false
    allowedTopLevel.add(path[0]!)
    const updated = pathValue(operation.update, path)
    const current = pathValue(plan.currentState, path)
    if (updated === undefined || equalJson(updated, current)
      || !setPathValue(expectedDesired, path, updated)) return false
    if (path.length > 1) {
      const nested = operation.update[path[0]!]
      if (!isRecord(nested)) return false
      const permittedNested = masks
        .map(candidate => fields[candidate])
        .filter(candidate => candidate?.[0] === path[0])
        .map(candidate => candidate![1]!)
      if (Object.keys(nested).some(key => !permittedNested.includes(key))) return false
    }
  }
  return Object.keys(operation.update).every(key => allowedTopLevel.has(key))
    && equalJson(plan.desiredState, expectedDesired)
    && hasValidRuntimeBidLimits(plan.desiredState[scheme])
}

const RuntimeResponsiveSearchAdSchema = z.strictObject({
  finalUrls: z.array(z.string().url().refine(value => value.startsWith('https://'))).length(1),
  responsiveSearchAd: z.strictObject({
    headlines: z.array(z.strictObject({ text: z.string().trim().min(1).max(30) })).min(3).max(15),
    descriptions: z.array(z.strictObject({ text: z.string().trim().min(1).max(90) })).min(2).max(4),
    path1: z.string().trim().min(1).max(15).optional(),
    path2: z.string().trim().min(1).max(15).optional()
  })
})
const RuntimeOriginalAdSchema = z.strictObject({
  resourceName: z.string(),
  adGroup: z.string(),
  status: z.enum(['ENABLED', 'PAUSED']),
  ad: RuntimeResponsiveSearchAdSchema
})
const RuntimeReplacementAdSchema = z.strictObject({
  adGroup: z.string(),
  status: z.literal('PAUSED'),
  ad: RuntimeResponsiveSearchAdSchema
})

function hasUniqueRuntimeRsaAssets(ad: z.infer<typeof RuntimeResponsiveSearchAdSchema>): boolean {
  const headlines = ad.responsiveSearchAd.headlines.map(asset => asset.text.toLocaleLowerCase('en-AU'))
  const descriptions = ad.responsiveSearchAd.descriptions.map(asset => asset.text.toLocaleLowerCase('en-AU'))
  return new Set(headlines).size === headlines.length
    && new Set(descriptions).size === descriptions.length
}

function isTypedResponsiveSearchAdReplacement(plan: GoogleAdsActionPlan): boolean {
  const current = z.strictObject({ original: RuntimeOriginalAdSchema }).safeParse(plan.currentState)
  const desired = z.strictObject({
    original: RuntimeOriginalAdSchema,
    replacement: RuntimeReplacementAdSchema
  }).safeParse(plan.desiredState)
  if (!current.success || !desired.success || !plan.resourceName
    || current.data.original.resourceName !== plan.resourceName
    || current.data.original.adGroup !== desired.data.replacement.adGroup
    || !new RegExp(`^customers/${plan.customerId}/adGroupAds/\\d+~\\d+$`).test(plan.resourceName)
    || !new RegExp(`^customers/${plan.customerId}/adGroups/\\d+$`).test(current.data.original.adGroup)
    || !equalJson(desired.data.original, { ...current.data.original, status: 'PAUSED' })
    || equalJson(current.data.original.ad, desired.data.replacement.ad)
    || !hasUniqueRuntimeRsaAssets(desired.data.replacement.ad)
    || plan.providerOperations.length !== 1) return false
  const mutation = plan.providerOperations[0]
  if (!mutation || mutation.service !== 'adGroupAds'
    || mutation.atomicity !== 'interdependent'
    || mutation.partialFailure !== false) return false
  const operations = [
    { create: desired.data.replacement },
    ...(current.data.original.status === 'PAUSED'
      ? []
      : [{
          update: { resourceName: plan.resourceName, status: 'PAUSED' },
          updateMask: 'status'
        }])
  ]
  return equalJson(mutation.operations, operations)
}

const MUTABLE_ENTITY_UPDATE_FIELDS = {
  update_campaign: {
    service: 'campaigns',
    segment: 'campaigns',
    composite: false,
    fields: {
      'name': ['name'],
      'campaign_budget': ['campaignBudget'],
      'network_settings.target_partner_search_network': ['networkSettings', 'targetPartnerSearchNetwork'],
      'start_date_time': ['startDateTime'],
      'end_date_time': ['endDateTime']
    }
  },
  update_ad_group: {
    service: 'adGroups',
    segment: 'adGroups',
    composite: false,
    fields: {
      name: ['name'],
      cpc_bid_micros: ['cpcBidMicros']
    }
  },
  update_keyword: {
    service: 'adGroupCriteria',
    segment: 'adGroupCriteria',
    composite: true,
    fields: {
      cpc_bid_micros: ['cpcBidMicros'],
      final_urls: ['finalUrls']
    }
  }
} as const

function pathValue(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const part of path) {
    if (!isRecord(current) || !Object.hasOwn(current, part)) return undefined
    current = current[part]
  }
  return current
}

function isTypedMutableEntityUpdate(plan: GoogleAdsActionPlan): boolean {
  const config = MUTABLE_ENTITY_UPDATE_FIELDS[
    plan.operation as keyof typeof MUTABLE_ENTITY_UPDATE_FIELDS
  ]
  if (!config || !plan.resourceName || plan.providerOperations.length !== 1
    || !isRecord(plan.currentState) || !isRecord(plan.desiredState)) return false
  const leaf = config.composite ? '\\d+~\\d+' : '\\d+'
  if (!new RegExp(`^customers/${plan.customerId}/${config.segment}/${leaf}$`).test(plan.resourceName)) return false
  const mutation = plan.providerOperations[0]
  if (!mutation || mutation.service !== config.service || mutation.operations.length !== 1) return false
  const operation = mutation.operations[0]
  if (!operation || !('update' in operation) || !isRecord(operation.update)
    || operation.update.resourceName !== plan.resourceName) return false
  const masks = operation.updateMask.split(',').map(mask => mask.trim()).filter(Boolean)
  if (masks.length === 0 || new Set(masks).size !== masks.length
    || masks.some(mask => !Object.hasOwn(config.fields, mask))) return false
  const allowedTopLevelKeys = new Set(['resourceName'])
  for (const mask of masks) {
    const path = (config.fields as Record<string, readonly string[]>)[mask]
    if (!path) return false
    allowedTopLevelKeys.add(path[0]!)
    const updated = pathValue(operation.update, path)
    const desired = pathValue(plan.desiredState, path)
    const current = pathValue(plan.currentState, path)
    if (updated === undefined || !equalJson(updated, desired) || equalJson(current, desired)) return false
    if (path.length > 1) {
      const nested = operation.update[path[0]!]
      if (!isRecord(nested) || Object.keys(nested).length !== 1 || !Object.hasOwn(nested, path[1]!)) return false
    }
  }
  return Object.keys(operation.update).every(key => allowedTopLevelKeys.has(key))
}

function isTypedNegativeKeywordRemoval(plan: GoogleAdsActionPlan): boolean {
  const stateSchema = z.object({
    resourceName: z.string(),
    scope: z.enum(['campaign', 'ad_group']),
    negative: z.literal(true),
    keyword: z.object({ text: z.string(), matchType: z.enum(['EXACT', 'PHRASE', 'BROAD']) }),
    removed: z.boolean()
  })
  const current = stateSchema.safeParse(plan.currentState)
  const desired = stateSchema.safeParse(plan.desiredState)
  if (!current.success || !desired.success || current.data.removed || !desired.data.removed
    || !plan.resourceName || current.data.resourceName !== plan.resourceName
    || !equalJson(desired.data, { ...current.data, removed: true })
    || plan.providerOperations.length !== 1) return false
  const segment = current.data.scope === 'campaign' ? 'campaignCriteria' : 'adGroupCriteria'
  const service = current.data.scope === 'campaign' ? 'campaignCriteria' : 'adGroupCriteria'
  if (!new RegExp(`^customers/${plan.customerId}/${segment}/\\d+~\\d+$`).test(plan.resourceName)) return false
  const mutation = plan.providerOperations[0]
  return Boolean(mutation && mutation.service === service
    && mutation.operations.length === 1
    && equalJson(mutation.operations[0], { remove: plan.resourceName }))
}

const RuntimeSharedNegativeKeywordSchema = z.strictObject({
  text: z.string().trim().min(1).max(80),
  matchType: z.enum(['EXACT', 'PHRASE', 'BROAD'])
})
const RuntimeSharedNegativeSetResourceSchema = z.strictObject({
  resourceName: z.string(),
  name: z.string().trim().min(1).max(255),
  type: z.literal('NEGATIVE_KEYWORDS'),
  status: z.literal('ENABLED')
})
const RuntimeSharedNegativeSetStateSchema = z.strictObject({
  sharedSet: RuntimeSharedNegativeSetResourceSchema,
  keywords: z.array(RuntimeSharedNegativeKeywordSchema).max(1_000),
  campaignResourceNames: z.array(z.string()).max(1_000),
  criterionResources: z.record(z.string(), z.string()),
  campaignLinkResources: z.record(z.string(), z.string())
})
const RuntimeSharedNegativeSetCreateSchema = z.strictObject({
  sharedSet: z.strictObject({
    name: z.string().trim().min(1).max(255),
    type: z.literal('NEGATIVE_KEYWORDS')
  }),
  keywords: z.array(RuntimeSharedNegativeKeywordSchema).min(1).max(1_000),
  campaignResourceNames: z.array(z.string()).max(1_000),
  criterionResources: z.record(z.string(), z.string()),
  campaignLinkResources: z.record(z.string(), z.string())
})

function runtimeSharedKeywordKey(keyword: z.infer<typeof RuntimeSharedNegativeKeywordSchema>): string {
  return `${keyword.matchType}:${keyword.text.toLocaleLowerCase('en-AU')}`
}

function hasValidSharedNegativeSetState(
  customerId: string,
  state: z.infer<typeof RuntimeSharedNegativeSetStateSchema>,
  requireCompleteResourceMaps: boolean
): boolean {
  const setPattern = new RegExp(`^customers/${customerId}/sharedSets/\\d+$`)
  const criterionPattern = new RegExp(`^customers/${customerId}/sharedCriteria/\\d+~\\d+$`)
  const campaignPattern = new RegExp(`^customers/${customerId}/campaigns/\\d+$`)
  const linkPattern = new RegExp(`^customers/${customerId}/campaignSharedSets/\\d+~\\d+$`)
  const keywordKeys = state.keywords.map(runtimeSharedKeywordKey)
  if (!setPattern.test(state.sharedSet.resourceName)
    || new Set(keywordKeys).size !== keywordKeys.length
    || !equalJson(state.keywords, [...state.keywords].sort((left, right) => (
      left.text.toLocaleLowerCase('en-AU').localeCompare(right.text.toLocaleLowerCase('en-AU'))
      || left.matchType.localeCompare(right.matchType)
    )))
    || !equalJson(state.campaignResourceNames, [...state.campaignResourceNames].sort())
    || new Set(state.campaignResourceNames).size !== state.campaignResourceNames.length
    || state.campaignResourceNames.some(resource => !campaignPattern.test(resource))) return false
  const criterionResourceKeys = Object.keys(state.criterionResources)
  const campaignLinkKeys = Object.keys(state.campaignLinkResources)
  if ((requireCompleteResourceMaps
    ? !equalJson(criterionResourceKeys.sort(), [...keywordKeys].sort())
    : criterionResourceKeys.some(key => !keywordKeys.includes(key)))
  || Object.values(state.criterionResources).some(resource => !criterionPattern.test(resource))) return false
  return (requireCompleteResourceMaps
    ? equalJson(campaignLinkKeys.sort(), [...state.campaignResourceNames].sort())
    : campaignLinkKeys.every(campaign => state.campaignResourceNames.includes(campaign)))
  && Object.values(state.campaignLinkResources).every(resource => linkPattern.test(resource))
}

function isTypedSharedNegativeSetMutation(plan: GoogleAdsActionPlan): boolean {
  if (plan.providerOperations.length !== 1) return false
  const mutation = plan.providerOperations[0]
  if (!mutation || mutation.service !== 'googleAds'
    || mutation.atomicity !== 'interdependent'
    || mutation.partialFailure !== false
    || mutation.operations.length > 1_000) return false
  const campaignPattern = new RegExp(`^customers/${plan.customerId}/campaigns/\\d+$`)
  const temporarySet = `customers/${plan.customerId}/sharedSets/-1`
  if (plan.resourceName === null) {
    const desired = RuntimeSharedNegativeSetCreateSchema.safeParse(plan.desiredState)
    if (!desired.success || !equalJson(plan.currentState, { exists: false })
      || Object.keys(desired.data.criterionResources).length > 0
      || Object.keys(desired.data.campaignLinkResources).length > 0
      || desired.data.campaignResourceNames.some(resource => !campaignPattern.test(resource))) return false
    const keywordKeys = desired.data.keywords.map(runtimeSharedKeywordKey)
    if (new Set(keywordKeys).size !== keywordKeys.length
      || !equalJson(desired.data.keywords, [...desired.data.keywords].sort((left, right) => (
        left.text.toLocaleLowerCase('en-AU').localeCompare(right.text.toLocaleLowerCase('en-AU'))
        || left.matchType.localeCompare(right.matchType)
      )))
      || !equalJson(desired.data.campaignResourceNames, [...desired.data.campaignResourceNames].sort())
      || new Set(desired.data.campaignResourceNames).size !== desired.data.campaignResourceNames.length) return false
    const expected = [
      { mutate: { sharedSetOperation: { create: {
        resourceName: temporarySet,
        ...desired.data.sharedSet
      } } } },
      ...desired.data.keywords.map(keyword => ({ mutate: { sharedCriterionOperation: { create: {
        sharedSet: temporarySet,
        negative: true,
        keyword
      } } } })),
      ...desired.data.campaignResourceNames.map(campaign => ({
        mutate: { campaignSharedSetOperation: { create: { campaign, sharedSet: temporarySet } } }
      }))
    ]
    return equalJson(mutation.operations, expected)
  }

  const current = RuntimeSharedNegativeSetStateSchema.safeParse(plan.currentState)
  const desired = RuntimeSharedNegativeSetStateSchema.safeParse(plan.desiredState)
  if (!current.success || !desired.success
    || desired.data.keywords.length === 0
    || current.data.sharedSet.resourceName !== plan.resourceName
    || desired.data.sharedSet.resourceName !== plan.resourceName
    || !hasValidSharedNegativeSetState(plan.customerId, current.data, true)
    || !hasValidSharedNegativeSetState(plan.customerId, desired.data, false)) return false
  const desiredKeywordKeys = new Set(desired.data.keywords.map(runtimeSharedKeywordKey))
  const currentKeywordKeys = new Set(current.data.keywords.map(runtimeSharedKeywordKey))
  const desiredCampaigns = new Set(desired.data.campaignResourceNames)
  const currentCampaigns = new Set(current.data.campaignResourceNames)
  const expected: Array<Record<string, unknown>> = []
  if (desired.data.sharedSet.name !== current.data.sharedSet.name) {
    expected.push({ mutate: { sharedSetOperation: {
      update: { resourceName: plan.resourceName, name: desired.data.sharedSet.name },
      updateMask: 'name'
    } } })
  }
  for (const key of [...currentKeywordKeys].filter(key => !desiredKeywordKeys.has(key)).sort()) {
    expected.push({ mutate: { sharedCriterionOperation: {
      remove: current.data.criterionResources[key]
    } } })
  }
  for (const keyword of desired.data.keywords.filter(item => !currentKeywordKeys.has(runtimeSharedKeywordKey(item)))) {
    expected.push({ mutate: { sharedCriterionOperation: { create: {
      sharedSet: plan.resourceName,
      negative: true,
      keyword
    } } } })
  }
  for (const campaign of [...currentCampaigns].filter(item => !desiredCampaigns.has(item)).sort()) {
    expected.push({ mutate: { campaignSharedSetOperation: {
      remove: current.data.campaignLinkResources[campaign]
    } } })
  }
  for (const campaign of desired.data.campaignResourceNames.filter(item => !currentCampaigns.has(item))) {
    expected.push({ mutate: { campaignSharedSetOperation: { create: {
      campaign,
      sharedSet: plan.resourceName
    } } } })
  }
  const expectedCriterionResources = Object.fromEntries(
    Object.entries(current.data.criterionResources).filter(([key]) => desiredKeywordKeys.has(key))
  )
  const expectedCampaignLinkResources = Object.fromEntries(
    Object.entries(current.data.campaignLinkResources).filter(([campaign]) => desiredCampaigns.has(campaign))
  )
  return expected.length > 0
    && equalJson(desired.data.criterionResources, expectedCriterionResources)
    && equalJson(desired.data.campaignLinkResources, expectedCampaignLinkResources)
    && equalJson(mutation.operations, expected)
}

export function isExecutableSearchGoogleAdsPlan(plan: GoogleAdsActionPlan): boolean {
  if (!isSearchGoogleAdsOperation(plan.operation) || plan.providerOperations.length === 0) return false
  const services = EXECUTABLE_SEARCH_SERVICES[
    plan.operation as keyof typeof EXECUTABLE_SEARCH_SERVICES
  ] as readonly string[] | undefined
  if (!services) return false
  const requested = plan.providerOperations.map(mutation => mutation.service)
  if (plan.operation === 'create_asset_group') return isTypedAssetGroupCreateBundle(plan)
  if (plan.operation === 'update_asset_group') return isTypedAssetGroupUpdate(plan)
  if (plan.operation === 'manage_asset_group_assets') return isTypedAssetGroupMembership(plan)
  if (plan.operation === 'manage_listing_groups') return isTypedListingGroupReplacement(plan)
  if (plan.operation === 'apply_recommendation'
    || plan.operation === 'dismiss_recommendation') return isTypedRecommendationMutation(plan)
  if (plan.operation === 'create_bidding_strategy'
    || plan.operation === 'update_bidding') return isTypedBiddingStrategyMutation(plan)
  if (plan.operation === 'replace_ad') return isTypedResponsiveSearchAdReplacement(plan)
  if (plan.operation === 'update_campaign'
    || plan.operation === 'update_ad_group'
    || plan.operation === 'update_keyword') return isTypedMutableEntityUpdate(plan)
  if (plan.operation === 'remove_negative_keyword') return isTypedNegativeKeywordRemoval(plan)
  if (plan.operation === 'manage_shared_negative_set') return isTypedSharedNegativeSetMutation(plan)
  if (plan.operation === 'attach_asset'
    || plan.operation === 'archive_asset_link'
    || plan.operation === 'detach_asset') {
    const desired = z.object({ scope: z.enum(['customer', 'campaign', 'ad_group']) }).safeParse(plan.desiredState)
    if (!desired.success || requested.length !== 1) return false
    const expectedService = {
      customer: 'customerAssets',
      campaign: 'campaignAssets',
      ad_group: 'adGroupAssets'
    }[desired.data.scope]
    return requested[0] === expectedService
  }
  if (plan.operation === 'set_audience_associations') {
    return requested.length === 1
      ? services.includes(requested[0] ?? '')
      : requested.length === 2 && requested[0] === 'adGroups' && requested[1] === 'adGroupCriteria'
  }
  return requested.length === 1 && services.includes(requested[0] ?? '')
}

async function runSearchGoogleAdsMutations(
  plan: GoogleAdsActionPlan,
  auth: Parameters<typeof mutateGoogleAds>[0]['auth'],
  mutate: SearchGoogleAdsExecutionDependencies['mutate'],
  validateOnly: boolean
): Promise<Awaited<ReturnType<typeof mutateGoogleAds>>> {
  const results: unknown[] = []
  const requestIds: string[] = []
  for (let index = 0; index < plan.providerOperations.length; index += 1) {
    const mutation = plan.providerOperations[index]!
    try {
      const result = await mutate({
        customerId: plan.customerId,
        auth,
        service: mutation.service,
        operations: mutation.operations,
        validateOnly,
        atomicity: mutation.atomicity,
        partialFailure: mutation.partialFailure
      })
      results.push(...result.results)
      if (result.requestId) requestIds.push(result.requestId)
      if (result.partialFailureError !== undefined) {
        return { results, requestId: requestIds.join(',') || undefined, partialFailureError: result.partialFailureError }
      }
    } catch (error) {
      if (!validateOnly && index > 0) {
        const normalized = normalizeGoogleAdsError(error)
        throw new GoogleAdsActionError({
          code: 'PARTIAL_MULTI_SERVICE_WRITE',
          category: 'provider',
          retryable: true,
          requestId: normalized.requestId ?? requestIds.at(-1),
          safeMessage: 'A multi-service Google Ads write requires reconciliation.'
        })
      }
      throw error
    }
  }
  return { results, requestId: requestIds.join(',') || undefined }
}

export async function validateSearchGoogleAdsControlPlan(
  plan: GoogleAdsActionPlan,
  overrides: Partial<Pick<SearchGoogleAdsExecutionDependencies,
    'resolveSession' | 'loadPlanState' | 'mutate'>> = {}
): Promise<Record<string, unknown>> {
  if (!isExecutableSearchGoogleAdsPlan(plan)) {
    return { actionPlanId: plan.id, valid: false, code: 'unsupported_action' }
  }
  const dependencies = { ...defaultExecutionDependencies, ...overrides }
  const session = await dependencies.resolveSession({
    clientId: plan.clientId,
    connectionId: plan.connectionId
  })
  if (session.connection.customerId !== plan.customerId) {
    return { actionPlanId: plan.id, valid: false, code: 'account_binding_changed' }
  }
  const current = await dependencies.loadPlanState(plan, session.auth)
  if (hashGoogleAdsValue(current) !== plan.currentStateFingerprint) {
    return { actionPlanId: plan.id, valid: false, code: 'stale_plan' }
  }
  const result = await runSearchGoogleAdsMutations(plan, session.auth, dependencies.mutate, true)
  return {
    actionPlanId: plan.id,
    valid: result.partialFailureError === undefined,
    providerRequestId: result.requestId ?? null,
    providerValidation: 'validate_only',
    diff: plan.diff
  }
}

export async function executeSearchGoogleAdsControlAction(
  plan: GoogleAdsActionPlan,
  authority: GoogleAdsControlAuthority,
  flags: GoogleAdsControlFlags,
  overrides: Partial<SearchGoogleAdsExecutionDependencies> = {}
): Promise<GoogleAdsExecutionOutcome> {
  if (!isExecutableSearchGoogleAdsPlan(plan)) {
    return { ok: false, status: 'blocked', message: 'This Google Ads action type is not active.' }
  }
  const dependencies = { ...defaultExecutionDependencies, ...overrides }
  const session = await dependencies.resolveSession({
    clientId: plan.clientId,
    connectionId: plan.connectionId
  })
  if (session.connection.customerId !== plan.customerId) {
    return { ok: false, status: 'forbidden', message: 'Google Ads account binding changed.' }
  }

  const actionClass = googleAdsAutomaticActionClassForOperation(plan.operation)
  const grant = plan.executionMode === 'automatic' && actionClass
    ? await dependencies.loadAutomationPolicy({
        clientId: plan.clientId,
        connectionId: plan.connectionId,
        customerId: plan.customerId,
        actionClass
      })
    : null
  const grantMatches = grant !== null
    && activeGrant(grant)
    && grant.id === plan.grantId
    && grant.policyVersion === plan.policyVersion

  if (plan.providerOperations.length === 0) {
    return { ok: false, status: 'blocked', message: 'Google Ads mutation is missing.' }
  }
  const runMutation = (validateOnly: boolean) => runSearchGoogleAdsMutations(
    plan, session.auth, dependencies.mutate, validateOnly
  )

  return executeGoogleAdsAction(plan.id, {
    clientId: plan.clientId,
    actorId: plan.actorId
  }, {
    loadPlan: dependencies.loadPlan,
    loadCurrent: candidate => dependencies.loadPlanState(candidate, session.auth),
    resolvePolicy: candidate => ({
      ...resolveGoogleAdsPolicy({
        operation: candidate.operation,
        actorRole: authority.actorRole,
        hasMediaPermission: roleHasPermission(authority.actorRole, 'MEDIA_BUYING'),
        hasElevatedPermission: roleHasPermission(authority.actorRole, 'MANAGEMENT'),
        hasWriteScope: authority.hasWriteScope,
        globalWriteEnabled: flags.write,
        automationEnabled: flags.automation,
        destructiveEnabled: flags.destructive,
        requestedMode: candidate.executionMode === 'automatic' ? 'automatic' : 'proposal',
        accountPolicy: candidate.executionMode === 'automatic'
          ? {
              enabled: grantMatches,
              actionClass: grantMatches ? grant?.actionClass : undefined
            }
          : { enabled: true }
      }),
      policyVersion: candidate.executionMode === 'automatic' && grantMatches && grant
        ? grant.policyVersion
        : 'google-ads-v1'
    }),
    claim: async (candidate, expectedStatus) => Boolean(await dependencies.claim({
      id: candidate.id,
      clientId: candidate.clientId,
      actorId: candidate.actorId,
      expectedStatus
    })),
    validate: () => runMutation(true),
    mutate: () => runMutation(false),
    verify: async (candidate, mutationResult) => {
      const actual = await dependencies.loadPlanState(candidate, session.auth, {}, mutationResult)
      return verifySearchGoogleAdsState(candidate.desiredState, actual)
    },
    event: async (input) => {
      await dependencies.event(input)
    },
    complete: async (input) => {
      const completed = await dependencies.complete(input)
      if (!completed) throw new Error('Google Ads action completion was not persisted')
    }
  })
}
