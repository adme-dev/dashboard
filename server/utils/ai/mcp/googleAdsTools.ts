import { z } from 'zod'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import {
  GoogleAdsActionPlanSchema,
  type GoogleAdsActionPlan
} from '~~/server/utils/googleAds/contracts'
import type { McpToolManifest } from './project'
import {
  MCP_CONFIRM_TOOL,
  type ClaimedProposal,
  type WriteConfirmOutcome
} from './writeTools'

export const GOOGLE_ADS_VALIDATE_PLAN_TOOL = 'google_ads_validate_action_plan'
export const GOOGLE_ADS_GET_STATUS_TOOL = 'google_ads_get_action_status'
export const GOOGLE_ADS_PROPOSE_ACTION_TOOL = 'propose_google_ads_action'
export const GOOGLE_ADS_PENDING_ACTION = 'google_ads_action'

const ActionPlanParams = z.strictObject({
  actionPlanId: z.string().uuid()
})

function descriptor(name: string, description: string): McpToolManifest {
  return {
    name,
    description,
    inputSchema: z.toJSONSchema(ActionPlanParams) as Record<string, unknown>
  }
}

export const googleAdsReadTools: McpToolManifest[] = [
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
  loadPlan(actionPlanId: string, actorId: string): Promise<GoogleAdsActionPlan | null>
  getStatus(plan: GoogleAdsActionPlan, context: ToolContext): Promise<unknown>
  validatePlan(plan: GoogleAdsActionPlan, context: ToolContext): Promise<unknown>
  proposePlan(plan: GoogleAdsActionPlan, context: ToolContext): Promise<{ proposalId: string }>
  executeAutomatic(plan: GoogleAdsActionPlan, context: ToolContext): Promise<unknown>
}

export type GoogleAdsMcpToolOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'not_found' | 'forbidden' | 'disabled' | 'bad_args' | 'blocked' | 'automation_disabled' | 'destructive_disabled' | 'invalid_state' | 'handler_error' }

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
      return { ok: true, data: await dependencies.validatePlan(plan, context) }
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
