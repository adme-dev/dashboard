import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { queryOne } from '~~/server/utils/db'
import {
  appendGoogleAdsActionEvent,
  approveGoogleAdsActionPlan,
  getGoogleAdsActionPlanForActor,
  linkGoogleAdsActionApproval
} from '~~/server/utils/googleAds/actionStore'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import {
  GOOGLE_ADS_PENDING_ACTION,
  type GoogleAdsConfirmDependencies,
  type GoogleAdsMcpFlags,
  type GoogleAdsMcpToolDependencies
} from './googleAdsTools'

export function googleAdsMcpFlagsFromEnv(): GoogleAdsMcpFlags {
  return {
    read: process.env.GOOGLE_ADS_MCP_READ_ENABLED === 'true',
    write: process.env.GOOGLE_ADS_MCP_WRITE_ENABLED === 'true',
    automation: process.env.GOOGLE_ADS_MCP_AUTOMATION_ENABLED === 'true',
    destructive: process.env.GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED === 'true'
  }
}

interface PendingActionRow {
  id: string
}

export interface PersistGoogleAdsMcpProposalDependencies {
  insertPending(plan: GoogleAdsActionPlan, context: ToolContext): Promise<PendingActionRow | null>
  linkApproval(plan: GoogleAdsActionPlan, approvalId: string): Promise<GoogleAdsActionPlan | null>
  event(plan: GoogleAdsActionPlan, approvalId: string): Promise<void>
}

export async function persistGoogleAdsMcpProposal(
  plan: GoogleAdsActionPlan,
  context: ToolContext,
  dependencies: PersistGoogleAdsMcpProposalDependencies
): Promise<{ proposalId: string }> {
  if (plan.actorId !== context.userId || plan.status !== 'pending_approval') {
    throw new Error('Google Ads action plan is not awaiting this actor')
  }
  const pending = await dependencies.insertPending(plan, context)
  if (!pending) throw new Error('Google Ads approval proposal could not be persisted')
  const linked = await dependencies.linkApproval(plan, pending.id)
  if (!linked) throw new Error('Google Ads approval proposal could not be linked')
  await dependencies.event(linked, pending.id)
  return { proposalId: pending.id }
}

async function insertPendingAction(
  plan: GoogleAdsActionPlan,
  context: ToolContext
): Promise<PendingActionRow | null> {
  return queryOne<PendingActionRow>(`
    INSERT INTO ai_pending_actions (
      conversation_id, user_id, tool_name, resolved_payload, status,
      source, client_scope, google_ads_action_plan_id
    ) VALUES (
      NULL, $1, $2, $3::jsonb, 'proposed', 'mcp', $4, $5
    )
    ON CONFLICT (google_ads_action_plan_id)
      WHERE google_ads_action_plan_id IS NOT NULL
    DO UPDATE SET google_ads_action_plan_id = EXCLUDED.google_ads_action_plan_id
    RETURNING id
  `, [
    context.userId,
    GOOGLE_ADS_PENDING_ACTION,
    JSON.stringify({ actionPlanId: plan.id }),
    plan.clientId,
    plan.id
  ])
}

function actionStatus(plan: GoogleAdsActionPlan): Record<string, unknown> {
  return {
    actionPlanId: plan.id,
    clientId: plan.clientId,
    customerId: plan.customerId,
    resourceType: plan.resourceType,
    resourceName: plan.resourceName,
    operation: plan.operation,
    riskTier: plan.riskTier,
    executionMode: plan.executionMode,
    status: plan.status,
    providerRequestId: plan.providerRequestId ?? null,
    verificationSummary: plan.verificationSummary ?? null,
    expiresAt: plan.expiresAt,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt ?? null
  }
}

function foundationValidation(plan: GoogleAdsActionPlan): Record<string, unknown> {
  const expired = new Date(plan.expiresAt).getTime() <= Date.now()
  const actionable = !expired && ['planned', 'pending_approval', 'approved'].includes(plan.status)
  return {
    actionPlanId: plan.id,
    valid: actionable && plan.policyDecision.allowed,
    expired,
    policyAllowed: plan.policyDecision.allowed,
    status: plan.status,
    diff: plan.diff,
    providerValidation: 'deferred_to_execution'
  }
}

export function buildGoogleAdsMcpToolDependencies(): GoogleAdsMcpToolDependencies {
  return {
    loadPlan: (actionPlanId, actorId) => getGoogleAdsActionPlanForActor(actionPlanId, actorId),
    getStatus: async plan => actionStatus(plan),
    validatePlan: async plan => foundationValidation(plan),
    proposePlan: (plan, context) => persistGoogleAdsMcpProposal(plan, context, {
      insertPending: insertPendingAction,
      linkApproval: (candidate, approvalId) => linkGoogleAdsActionApproval({
        id: candidate.id,
        clientId: candidate.clientId,
        actorId: candidate.actorId,
        approvalId
      }),
      event: async (candidate, approvalId) => {
        await appendGoogleAdsActionEvent({
          planId: candidate.id,
          clientId: candidate.clientId,
          actorId: candidate.actorId,
          eventType: 'approval_proposed',
          metadata: { approvalId }
        })
      }
    }),
    // Campaign-family execution adapters are registered by the typed tool plans. Until then the
    // independently dormant automation flag fails closed instead of guessing at provider state.
    executeAutomatic: async () => {
      throw new Error('No active typed Google Ads execution adapter')
    }
  }
}

export function buildGoogleAdsConfirmDependencies(): GoogleAdsConfirmDependencies {
  return {
    loadPlan: (actionPlanId, actorId) => getGoogleAdsActionPlanForActor(actionPlanId, actorId),
    // Foundation exposes no campaign-family action creators, so confirmation remains fail-closed
    // until a typed execution adapter exists for the plan operation.
    canExecutePlan: () => false,
    approvePlan: (plan, approvalId) => approveGoogleAdsActionPlan({
      id: plan.id,
      clientId: plan.clientId,
      actorId: plan.actorId,
      approvalId
    }),
    executeConfirmed: async () => {
      throw new Error('No active typed Google Ads execution adapter')
    }
  }
}
