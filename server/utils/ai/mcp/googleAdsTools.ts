import { z } from 'zod'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import {
  GoogleAdsActionPlanSchema,
  type GoogleAdsActionPlan
} from '~~/server/utils/googleAds/contracts'
import type { McpToolManifest } from './project'
import {
  googleAdsSearchPlanningTools,
  isGoogleAdsSearchPlanningTool
} from './googleAdsSearchTools'
import {
  MCP_CONFIRM_TOOL,
  type ClaimedProposal,
  type WriteConfirmOutcome
} from './writeTools'
import { GoogleAdsRecommendationTypeSchema } from '~~/server/utils/googleAds/recommendations'
import type { GoogleAdsInventoryKind } from '~~/server/utils/googleAds/inventory'

export const GOOGLE_ADS_VALIDATE_PLAN_TOOL = 'google_ads_validate_action_plan'
export const GOOGLE_ADS_GET_STATUS_TOOL = 'google_ads_get_action_status'
export const GOOGLE_ADS_LIST_RECOMMENDATIONS_TOOL = 'google_ads_list_recommendations'
export const GOOGLE_ADS_LIST_CAMPAIGNS_TOOL = 'google_ads_list_campaigns'
export const GOOGLE_ADS_LIST_AD_GROUPS_TOOL = 'google_ads_list_ad_groups'
export const GOOGLE_ADS_LIST_ADS_TOOL = 'google_ads_list_ads'
export const GOOGLE_ADS_LIST_KEYWORDS_TOOL = 'google_ads_list_keywords'
export const GOOGLE_ADS_LIST_TARGETING_TOOL = 'google_ads_list_targeting'
export const GOOGLE_ADS_LIST_ASSETS_TOOL = 'google_ads_list_assets'
export const GOOGLE_ADS_LIST_CONVERSION_ACTIONS_TOOL = 'google_ads_list_conversion_actions'
export const GOOGLE_ADS_PROPOSE_ACTION_TOOL = 'propose_google_ads_action'
export const GOOGLE_ADS_RUN_SEARCH_TERM_POLICY_TOOL = 'google_ads_run_search_term_policy'
export const GOOGLE_ADS_RUN_PAUSE_POLICY_TOOL = 'google_ads_run_pause_policy'
export const GOOGLE_ADS_PENDING_ACTION = 'google_ads_action'

const ActionPlanParams = z.strictObject({
  actionPlanId: z.string().uuid()
})
const RunSearchTermPolicyParams = z.strictObject({
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  scope: z.enum(['campaign', 'ad_group']),
  parentResourceName: z.string().trim().min(1).max(1_000)
})
const RunPausePolicyParams = z.strictObject({
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  entityType: z.enum(['campaign', 'ad_group', 'ad', 'keyword']),
  resourceName: z.string().trim().min(1).max(1_000)
})
const ListRecommendationsParams = z.strictObject({
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  maxResults: z.number().int().min(1).max(100).default(50),
  types: z.array(GoogleAdsRecommendationTypeSchema).max(50).default([]),
  includeDismissed: z.boolean().default(false)
})
export type ListGoogleAdsRecommendationsToolInput = z.infer<typeof ListRecommendationsParams>
const InventoryCommon = {
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  maxResults: z.number().int().min(1).max(500).default(100)
}
const EntityStatusSchema = z.enum(['ALL', 'ENABLED', 'PAUSED', 'REMOVED']).default('ALL')
const ConversionStatusSchema = z.enum(['ALL', 'ENABLED', 'HIDDEN', 'REMOVED']).default('ALL')
const CampaignResourceNameSchema = z.string().regex(/^customers\/\d{1,20}\/campaigns\/\d{1,20}$/)
const AdGroupResourceNameSchema = z.string().regex(/^customers\/\d{1,20}\/adGroups\/\d{1,20}$/)
const CampaignInventoryParams = z.strictObject({
  ...InventoryCommon,
  status: EntityStatusSchema
})
const AdGroupInventoryParams = z.strictObject({
  ...InventoryCommon,
  status: EntityStatusSchema,
  campaignResourceName: CampaignResourceNameSchema.optional()
})
const ChildInventoryParams = z.strictObject({
  ...InventoryCommon,
  status: EntityStatusSchema,
  campaignResourceName: CampaignResourceNameSchema.optional(),
  adGroupResourceName: AdGroupResourceNameSchema.optional()
})
const KeywordInventoryParams = ChildInventoryParams.extend({
  includeNegative: z.boolean().default(true)
})
const TargetingInventoryParams = z.strictObject({
  ...InventoryCommon,
  campaignResourceName: CampaignResourceNameSchema.optional(),
  adGroupResourceName: AdGroupResourceNameSchema.optional(),
  scope: z.enum(['CAMPAIGN', 'AD_GROUP', 'BOTH']).default('BOTH')
})
const AssetInventoryParams = z.strictObject(InventoryCommon)
const ConversionActionInventoryParams = z.strictObject({
  ...InventoryCommon,
  status: ConversionStatusSchema
})

export interface GoogleAdsInventoryToolInput {
  clientId: string
  connectionId: string
  maxResults: number
  status?: 'ALL' | 'ENABLED' | 'PAUSED' | 'REMOVED' | 'HIDDEN'
  campaignResourceName?: string
  adGroupResourceName?: string
  includeNegative?: boolean
  scope?: 'CAMPAIGN' | 'AD_GROUP' | 'BOTH'
}

const inventoryTools: Record<string, {
  kind: GoogleAdsInventoryKind
  schema: z.ZodType<GoogleAdsInventoryToolInput>
  description: string
}> = {
  [GOOGLE_ADS_LIST_CAMPAIGNS_TOOL]: {
    kind: 'campaign', schema: CampaignInventoryParams,
    description: 'List a bounded typed campaign inventory with status, channel, dates, budget, and bidding strategy. No raw GAQL is accepted.'
  },
  [GOOGLE_ADS_LIST_AD_GROUPS_TOOL]: {
    kind: 'ad_group', schema: AdGroupInventoryParams,
    description: 'List bounded typed ad groups, optionally within one validated campaign resource.'
  },
  [GOOGLE_ADS_LIST_ADS_TOOL]: {
    kind: 'ad', schema: ChildInventoryParams,
    description: 'List bounded typed ads with hierarchy, serving status, final URLs, and policy approval state.'
  },
  [GOOGLE_ADS_LIST_KEYWORDS_TOOL]: {
    kind: 'keyword', schema: KeywordInventoryParams,
    description: 'List bounded typed positive and negative keywords with match type, status, hierarchy, and quality score.'
  },
  [GOOGLE_ADS_LIST_TARGETING_TOOL]: {
    kind: 'targeting', schema: TargetingInventoryParams,
    description: 'List bounded typed campaign and ad-group targeting criteria, including location, language, schedule, device, audience, placement, and demographic criteria.'
  },
  [GOOGLE_ADS_LIST_ASSETS_TOOL]: {
    kind: 'asset', schema: AssetInventoryParams,
    description: 'List a bounded typed Google Ads asset inventory with asset type and source.'
  },
  [GOOGLE_ADS_LIST_CONVERSION_ACTIONS_TOOL]: {
    kind: 'conversion_action', schema: ConversionActionInventoryParams,
    description: 'List bounded typed conversion actions with primary or secondary bidding state, category, origin, owner, and status.'
  }
}

function descriptor(name: string, description: string, schema: z.ZodType = ActionPlanParams): McpToolManifest {
  return {
    name,
    description,
    inputSchema: z.toJSONSchema(schema) as Record<string, unknown>
  }
}

export const googleAdsReadTools: McpToolManifest[] = [
  ...Object.entries(inventoryTools).map(([name, config]) => descriptor(
    name,
    config.description,
    config.schema
  )),
  descriptor(
    GOOGLE_ADS_LIST_RECOMMENDATIONS_TOOL,
    'List a bounded, typed Google Ads recommendation inventory with optimization score. Optional type filters are enum-like values; no raw GAQL is accepted.',
    ListRecommendationsParams
  ),
  descriptor(
    GOOGLE_ADS_VALIDATE_PLAN_TOOL,
    'Validate a server-issued Google Ads action plan without applying the change. Requires the plan ID returned by a typed Google Ads tool.'
  ),
  descriptor(
    GOOGLE_ADS_GET_STATUS_TOOL,
    'Get the safe lifecycle status of a server-issued Google Ads action plan. Returns no credentials or raw provider payloads.'
  )
]

export const googleAdsWriteTools: McpToolManifest[] = [
  ...googleAdsSearchPlanningTools,
  descriptor(
    GOOGLE_ADS_RUN_SEARCH_TERM_POLICY_TOOL,
    'Evaluate fresh Google search-term metrics against the active account policy and automatically add only qualified, unprotected negative keywords within policy caps and cooldowns.',
    RunSearchTermPolicyParams
  ),
  descriptor(
    GOOGLE_ADS_RUN_PAUSE_POLICY_TOOL,
    'Evaluate fresh provider metrics for one allowlisted entity and pause it only when every active account-policy threshold, cap, cooldown, and manual-override guard passes.',
    RunPausePolicyParams
  ),
  descriptor(
    GOOGLE_ADS_PROPOSE_ACTION_TOOL,
    'Submit a server-issued Google Ads action plan for governed execution. Proposal plans return a proposalId for confirm_action; policy-approved automatic plans run only when automation is enabled.'
  )
]

const GOOGLE_ADS_TOOL_NAMES = new Set([
  ...googleAdsReadTools.map(tool => tool.name),
  ...googleAdsWriteTools.map(tool => tool.name)
])

export interface GoogleAdsMcpFlags {
  read: boolean
  write: boolean
  automation: boolean
  destructive: boolean
}

export function isGoogleAdsToolName(name: string): boolean {
  return GOOGLE_ADS_TOOL_NAMES.has(name)
}

export function isGoogleAdsWriteToolName(name: string): boolean {
  return name === GOOGLE_ADS_PROPOSE_ACTION_TOOL
    || name === GOOGLE_ADS_RUN_SEARCH_TERM_POLICY_TOOL
    || name === GOOGLE_ADS_RUN_PAUSE_POLICY_TOOL
    || isGoogleAdsSearchPlanningTool(name)
}

export function projectGoogleAdsTools(role: string, flags: GoogleAdsMcpFlags): McpToolManifest[] {
  if (!roleHasPermission(role, 'MEDIA_BUYING')) return []
  const projected: McpToolManifest[] = []
  if (flags.read) projected.push(...googleAdsReadTools)
  if (flags.write) {
    projected.push(...googleAdsWriteTools)
    projected.push({
      name: MCP_CONFIRM_TOOL,
      description: 'Confirm and execute a previously proposed action by proposalId. Higher-risk actions require ack:true.',
      inputSchema: z.toJSONSchema(z.strictObject({
        proposalId: z.string().min(8),
        ack: z.boolean().optional()
      })) as Record<string, unknown>
    })
  }
  return projected
}

export interface GoogleAdsMcpToolDependencies {
  listInventory(
    kind: GoogleAdsInventoryKind,
    input: GoogleAdsInventoryToolInput,
    context: ToolContext
  ): Promise<unknown>
  listRecommendations(
    input: ListGoogleAdsRecommendationsToolInput,
    context: ToolContext
  ): Promise<unknown>
  loadPlan(actionPlanId: string, actorId: string): Promise<GoogleAdsActionPlan | null>
  getStatus(plan: GoogleAdsActionPlan, context: ToolContext): Promise<unknown>
  validatePlan(plan: GoogleAdsActionPlan, context: ToolContext): Promise<unknown>
  recordValidation(
    plan: GoogleAdsActionPlan,
    validation: unknown,
    context: ToolContext
  ): Promise<void>
  proposePlan(plan: GoogleAdsActionPlan, context: ToolContext): Promise<{ proposalId: string }>
  executeAutomatic(plan: GoogleAdsActionPlan, context: ToolContext): Promise<unknown>
  runSearchTermPolicy(input: z.infer<typeof RunSearchTermPolicyParams>, context: ToolContext): Promise<unknown>
  runPausePolicy(input: z.infer<typeof RunPausePolicyParams>, context: ToolContext): Promise<unknown>
}

export type GoogleAdsMcpToolOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'not_found' | 'forbidden' | 'disabled' | 'bad_args' | 'blocked' | 'automation_disabled' | 'destructive_disabled' | 'invalid_state' | 'validation_failed' | 'handler_error' }

function validationPassed(validation: unknown): boolean {
  return Boolean(validation && typeof validation === 'object'
    && (validation as { valid?: unknown }).valid === true)
}

export async function executeGoogleAdsTool(
  name: string,
  args: unknown,
  context: ToolContext,
  flags: GoogleAdsMcpFlags,
  dependencies: GoogleAdsMcpToolDependencies
): Promise<GoogleAdsMcpToolOutcome> {
  if (!isGoogleAdsToolName(name)) {
    return { ok: false, error: `Unknown Google Ads tool: ${name}`, code: 'not_found' }
  }
  if (!roleHasPermission(context.userRole, 'MEDIA_BUYING')) {
    return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  }

  const isWrite = isGoogleAdsWriteToolName(name)
  if (isWrite && !flags.write) {
    return { ok: false, error: 'Google Ads write tools are not enabled over MCP.', code: 'disabled' }
  }
  if (!isWrite && !flags.read) {
    return { ok: false, error: 'Google Ads read tools are not enabled over MCP.', code: 'disabled' }
  }

  const inventory = inventoryTools[name]
  if (inventory) {
    const inventoryArgs = inventory.schema.safeParse(args)
    if (!inventoryArgs.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
    try {
      return {
        ok: true,
        data: await dependencies.listInventory(inventory.kind, inventoryArgs.data, context)
      }
    } catch {
      return { ok: false, error: 'Google Ads inventory read failed.', code: 'handler_error' }
    }
  }

  if (name === GOOGLE_ADS_LIST_RECOMMENDATIONS_TOOL) {
    const listArgs = ListRecommendationsParams.safeParse(args)
    if (!listArgs.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
    try {
      return { ok: true, data: await dependencies.listRecommendations(listArgs.data, context) }
    } catch {
      return { ok: false, error: 'Google Ads recommendation read failed.', code: 'handler_error' }
    }
  }

  if (name === GOOGLE_ADS_RUN_SEARCH_TERM_POLICY_TOOL || name === GOOGLE_ADS_RUN_PAUSE_POLICY_TOOL) {
    if (!flags.automation) {
      return { ok: false, error: 'Google Ads automatic actions are not enabled.', code: 'automation_disabled' }
    }
    const schema = name === GOOGLE_ADS_RUN_SEARCH_TERM_POLICY_TOOL
      ? RunSearchTermPolicyParams
      : RunPausePolicyParams
    const runnerArgs = schema.safeParse(args)
    if (!runnerArgs.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }
    try {
      const data = name === GOOGLE_ADS_RUN_SEARCH_TERM_POLICY_TOOL
        ? await dependencies.runSearchTermPolicy(
            RunSearchTermPolicyParams.parse(runnerArgs.data), context
          )
        : await dependencies.runPausePolicy(
            RunPausePolicyParams.parse(runnerArgs.data), context
          )
      return { ok: true, data }
    } catch {
      return { ok: false, error: 'Google Ads policy automation failed.', code: 'handler_error' }
    }
  }

  const parsed = ActionPlanParams.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }

  try {
    const loaded = await dependencies.loadPlan(parsed.data.actionPlanId, context.userId)
    if (!loaded) return { ok: false, error: 'Action plan not found.', code: 'not_found' }
    const plan = GoogleAdsActionPlanSchema.parse(loaded)
    if (plan.actorId !== context.userId) {
      return { ok: false, error: 'This action plan belongs to another user.', code: 'forbidden' }
    }

    if (name === GOOGLE_ADS_GET_STATUS_TOOL) {
      return { ok: true, data: await dependencies.getStatus(plan, context) }
    }
    if (name === GOOGLE_ADS_VALIDATE_PLAN_TOOL) {
      const validation = await dependencies.validatePlan(plan, context)
      await dependencies.recordValidation(plan, validation, context)
      return { ok: true, data: validation }
    }
    if (!plan.policyDecision.allowed || plan.executionMode === 'blocked') {
      return { ok: false, error: 'This action plan is blocked by policy.', code: 'blocked' }
    }
    if (plan.riskTier === 'destructive_confirm' && !flags.destructive) {
      return {
        ok: false,
        error: 'Permanent Google Ads removal is not enabled.',
        code: 'destructive_disabled'
      }
    }

    if (plan.executionMode === 'automatic') {
      if (!flags.automation) {
        return {
          ok: false,
          error: 'Google Ads automatic actions are not enabled.',
          code: 'automation_disabled'
        }
      }
      if (plan.status !== 'planned') {
        return { ok: false, error: 'This automatic plan is no longer actionable.', code: 'invalid_state' }
      }
      return { ok: true, data: await dependencies.executeAutomatic(plan, context) }
    }

    if (plan.status !== 'pending_approval') {
      return { ok: false, error: 'This proposal is no longer awaiting approval.', code: 'invalid_state' }
    }
    const validation = await dependencies.validatePlan(plan, context)
    await dependencies.recordValidation(plan, validation, context)
    if (!validationPassed(validation)) {
      return {
        ok: false,
        error: 'Google Ads preflight validation did not pass. Create a fresh action plan before proposing it.',
        code: 'validation_failed'
      }
    }
    return { ok: true, data: await dependencies.proposePlan(plan, context) }
  } catch {
    return { ok: false, error: 'Google Ads tool execution failed.', code: 'handler_error' }
  }
}

const PendingGoogleAdsPayloadSchema = z.strictObject({
  actionPlanId: z.string().uuid()
})

export interface GoogleAdsConfirmDependencies {
  loadPlan(actionPlanId: string, actorId: string): Promise<GoogleAdsActionPlan | null>
  approvePlan(
    plan: GoogleAdsActionPlan,
    approvalId: string,
    context: ToolContext
  ): Promise<GoogleAdsActionPlan | null>
  executeConfirmed(plan: GoogleAdsActionPlan, context: ToolContext): Promise<unknown>
  canExecutePlan?: (plan: GoogleAdsActionPlan) => boolean
}

export async function dispatchGoogleAdsConfirm(
  row: ClaimedProposal,
  proposalId: string,
  acknowledged: boolean,
  context: ToolContext,
  flags: GoogleAdsMcpFlags,
  dependencies: GoogleAdsConfirmDependencies
): Promise<WriteConfirmOutcome | null> {
  if (row.tool_name !== GOOGLE_ADS_PENDING_ACTION) return null
  if (!flags.write) {
    return { ok: false, error: 'Google Ads write tools are not enabled over MCP.', code: 'forbidden' }
  }
  if (!roleHasPermission(context.userRole, 'MEDIA_BUYING')) {
    return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  }

  const payload = PendingGoogleAdsPayloadSchema.safeParse(row.resolved_payload)
  if (!payload.success) {
    return { ok: false, error: 'The Google Ads proposal payload is invalid.', code: 'handler_error' }
  }

  try {
    const loaded = await dependencies.loadPlan(payload.data.actionPlanId, context.userId)
    if (!loaded) return { ok: false, error: 'Google Ads action plan was not found.', code: 'forbidden' }
    const plan = GoogleAdsActionPlanSchema.parse(loaded)
    if (plan.actorId !== context.userId || plan.status !== 'pending_approval') {
      return { ok: false, error: 'Google Ads action plan is no longer awaiting your approval.', code: 'forbidden' }
    }
    if (dependencies.canExecutePlan && !dependencies.canExecutePlan(plan)) {
      return { ok: false, error: 'This Google Ads action type is not active yet.', code: 'forbidden' }
    }
    if (plan.riskTier === 'destructive_confirm' && !flags.destructive) {
      return { ok: false, error: 'Permanent Google Ads removal is not enabled.', code: 'forbidden' }
    }
    if ((plan.riskTier === 'rich_confirm' || plan.riskTier === 'destructive_confirm') && !acknowledged) {
      return { ok: false, error: 'This Google Ads action requires explicit ack:true.', code: 'confirm_required' }
    }

    const approvalId = z.string().uuid().parse(proposalId)
    const approved = await dependencies.approvePlan(plan, approvalId, context)
    if (!approved) {
      return { ok: false, error: 'Google Ads action plan was already handled or expired.', code: 'forbidden' }
    }
    const result = await dependencies.executeConfirmed(approved, context)
    if (result && typeof result === 'object' && 'ok' in result
      && (result as { ok?: unknown }).ok === false) {
      const message = 'message' in result && typeof (result as { message?: unknown }).message === 'string'
        ? (result as { message: string }).message
        : 'Google Ads action did not complete successfully.'
      return { ok: false, error: message, code: 'handler_error' }
    }
    return { ok: true, data: result }
  } catch {
    return { ok: false, error: 'Google Ads confirmation failed.', code: 'handler_error' }
  }
}
