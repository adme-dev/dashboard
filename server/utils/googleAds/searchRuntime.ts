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

interface AutomationPolicyRow {
  id: string
  actionClass: string
  policyVersion: string
  enabled: boolean
  conditions: unknown
  maxDailyActions: number | null
  actionsToday: number
}

const AutomationPolicyRowSchema = z.object({
  id: z.string().uuid(),
  actionClass: z.enum(['negative_keywords', 'pause', 'recommendation_dismissal', 'asset_detachment']),
  policyVersion: z.string().min(1).max(255),
  enabled: z.boolean(),
  conditions: z.record(z.string(), z.unknown()),
  maxDailyActions: z.number().int().positive().nullable(),
  actionsToday: z.number().int().nonnegative()
})

export async function loadGoogleAdsAutomationPolicy(
  input: LoadAutomationPolicyInput
): Promise<GoogleAdsAutomationPolicyGrant | null> {
  const row = await queryOne<AutomationPolicyRow>(`
    SELECT
      p.id,
      p.action_class AS "actionClass",
      p.policy_version AS "policyVersion",
      p.enabled,
      p.conditions,
      p.max_daily_actions AS "maxDailyActions",
      COALESCE((
        SELECT COUNT(*)::int
        FROM google_ads_action_plans ap
        WHERE ap.grant_id = p.id::text
          AND ap.status IN ('verified', 'partially_verified')
          AND ap.completed_at >= date_trunc('day', NOW())
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
  return row ? AutomationPolicyRowSchema.parse(row) : null
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
  resourceNames: z.array(z.string().min(1).max(1_000)).min(1).max(1_000).optional()
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
  resourceNames: z.array(z.string().min(1).max(1_000)).min(1).max(1_000).optional()
})
const PauseAutomationArgumentsSchema = z.object({ resourceName: z.string() })

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
    return true
  }
  if (grant.actionClass === 'pause') {
    const conditions = PauseAutomationConditionsSchema.safeParse(grant.conditions)
    const args = PauseAutomationArgumentsSchema.safeParse(input.arguments)
    if (!conditions.success || !args.success) return false
    if (conditions.data.allowedResourceTypes
      && !conditions.data.allowedResourceTypes.includes(input.resourceType as never)) return false
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
      policyCode: plan.policyDecision.code ?? null
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

export function isExecutableSearchGoogleAdsPlan(plan: GoogleAdsActionPlan): boolean {
  const activeOperation = [
    'pause_campaign', 'archive_campaign', 'enable_campaign', 'set_campaign_status',
    'pause_ad_group', 'archive_ad_group', 'enable_ad_group', 'set_ad_group_status',
    'pause_ad', 'archive_ad', 'enable_ad', 'update_ad_status',
    'pause_keyword', 'enable_keyword', 'set_keyword_status',
    'add_negative_keywords'
  ].includes(plan.operation)
  return isSearchGoogleAdsOperation(plan.operation)
    && activeOperation
    && plan.providerOperations.length === 1
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
  const mutation = plan.providerOperations[0]
  if (!mutation) return { actionPlanId: plan.id, valid: false, code: 'missing_mutation' }
  const result = await dependencies.mutate({
    customerId: plan.customerId,
    auth: session.auth,
    service: mutation.service,
    operations: mutation.operations,
    validateOnly: true,
    atomicity: mutation.atomicity,
    partialFailure: mutation.partialFailure
  })
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

  const mutation = plan.providerOperations[0]
  if (!mutation) return { ok: false, status: 'blocked', message: 'Google Ads mutation is missing.' }
  const runMutation = (validateOnly: boolean) => dependencies.mutate({
    customerId: plan.customerId,
    auth: session.auth,
    service: mutation.service,
    operations: mutation.operations,
    validateOnly,
    atomicity: mutation.atomicity,
    partialFailure: mutation.partialFailure
  })

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
    verify: async (candidate) => {
      const actual = await dependencies.loadPlanState(candidate, session.auth)
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
