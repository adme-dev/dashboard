import type { ToolContext } from '~~/server/utils/ai/toolContext'
import { queryOne, queryRows } from '~~/server/utils/db'
import {
  appendGoogleAdsActionEvent,
  approveGoogleAdsActionPlan,
  getGoogleAdsActionPlanForActor,
  linkGoogleAdsActionApproval
} from '~~/server/utils/googleAds/actionStore'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import { resolveGoogleAdsControlSession } from '~~/server/utils/googleAds/controlSession'
import { listGoogleAdsRecommendations } from '~~/server/utils/googleAds/recommendations'
import {
  listGoogleAdsInventory,
  type ListGoogleAdsInventoryInput
} from '~~/server/utils/googleAds/inventory'
import { resolveGoogleAdsAccount } from '~~/server/utils/googleAds/accountResolution'
import { getGoogleAdsCallAnalytics } from '~~/server/utils/googleAdsCallAnalytics'
import { measurementFreshnessRepository } from '~~/server/utils/measurement/freshnessRepository'
import { measurementReconciliationRepository } from '~~/server/utils/measurement/reconciliationRepository'
import {
  executeSearchGoogleAdsControlAction,
  isExecutableSearchGoogleAdsPlan,
  validateSearchGoogleAdsControlPlan
} from '~~/server/utils/googleAds/searchRuntime'
import {
  runGoogleAdsPausePolicy,
  runGoogleAdsSearchTermPolicy
} from '~~/server/utils/googleAds/automation'
import {
  inspectGoogleAdsActionPlanDrift,
  reverifyGoogleAdsActionPlan
} from '~~/server/utils/googleAds/reverification'
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

function validationAuditMetadata(validation: unknown): Record<string, unknown> {
  const record = validation && typeof validation === 'object'
    ? validation as Record<string, unknown>
    : {}
  return {
    valid: record.valid === true,
    code: typeof record.code === 'string' ? record.code : null,
    providerValidation: typeof record.providerValidation === 'string'
      ? record.providerValidation
      : null,
    providerRequestId: typeof record.providerRequestId === 'string'
      ? record.providerRequestId
      : null
  }
}

export function buildGoogleAdsMcpToolDependencies(
  flags: GoogleAdsMcpFlags = googleAdsMcpFlagsFromEnv()
): GoogleAdsMcpToolDependencies {
  return {
    listInventory: async (kind, input) => {
      const session = await resolveGoogleAdsControlSession({
        clientId: input.clientId,
        connectionId: input.connectionId
      })
      const [inventory, binding] = await Promise.all([
        listGoogleAdsInventory({
          kind,
          customerId: session.connection.customerId,
          auth: session.auth,
          maxResults: input.maxResults,
          ...(input.status ? { status: input.status } : {}),
          ...(input.campaignResourceName
            ? { campaignResourceName: input.campaignResourceName }
            : {}),
          ...(input.adGroupResourceName ? { adGroupResourceName: input.adGroupResourceName } : {}),
          ...(input.includeNegative === undefined ? {} : { includeNegative: input.includeNegative }),
          ...(input.scope ? { scope: input.scope } : {})
        } as ListGoogleAdsInventoryInput),
        queryOne<{
          account_role: string
          operating_customer_id: string
          login_customer_id: string | null
        }>(
          `SELECT account_role, operating_customer_id, login_customer_id
             FROM google_ads_account_bindings
            WHERE client_id = $1 AND connection_id = $2
              AND operating_customer_id = $3
            LIMIT 1`,
          [input.clientId, input.connectionId, session.connection.customerId]
        )
      ])
      return {
        ...(inventory as Record<string, unknown>),
        resolution: {
          clientId: input.clientId,
          connectionId: input.connectionId,
          operatingCustomerId: session.connection.customerId,
          loginCustomerId: session.auth.loginCustomerId ?? null,
          accountRole: binding?.account_role ?? null,
          mappingStatus: binding ? 'resolved' : 'missing_mapping',
          resolutionKind: 'direct'
        }
      }
    },
    resolveAccount: input => resolveGoogleAdsAccount({
      query: input.clientName,
      aggregate: input.aggregate
    }),
    readMeasurementHealth: async (input) => {
      const [freshness, reconciliation] = await Promise.all([
        measurementFreshnessRepository.list({ clientId: input.clientId }),
        measurementReconciliationRepository.list({ clientId: input.clientId })
      ])
      const blockers = reconciliation.items.flatMap(item => item.blockers)
      const unhealthyStreams = freshness.streams.filter(item => item.status !== 'fresh')
      return {
        clientId: input.clientId,
        status: blockers.length > 0 || unhealthyStreams.length > 0 ? 'degraded' : 'healthy',
        blockers: [...new Set(blockers)],
        freshness: freshness.streams,
        reconciliationSummary: reconciliation.summary
      }
    },
    readReconciliation: async (input) => {
      const resolution = input.accountQuery
        ? await resolveGoogleAdsAccount({ query: input.accountQuery, aggregate: false })
        : null
      if (resolution?.status === 'resolved' && resolution.clientId !== input.clientId) {
        throw new Error('Account binding does not belong to client')
      }
      const account = resolution?.status === 'resolved' ? resolution.accounts[0] : null
      return {
        accountResolution: resolution,
        reconciliation: await measurementReconciliationRepository.list({
          clientId: input.clientId,
          expectedAccountCustomerId: account?.operatingCustomerId ?? null,
          expectedAccountLabel: resolution?.status === 'resolved' ? resolution.matchedName : undefined
        })
      }
    },
    readCallSummary: input => getGoogleAdsCallAnalytics(input),
    readSyncStatus: async (input) => {
      const [freshness, jobs] = await Promise.all([
        measurementFreshnessRepository.list({ clientId: input.clientId }),
        queryRows<{
          id: string
          stream: string
          requested_start_date: string
          requested_end_date: string
          covered_start_date: string | null
          covered_end_date: string | null
          state: string
          expected_units: number | string | null
          completed_units: number | string
          failure_code: string | null
          created_at: string
        }>(
          `SELECT id, stream, requested_start_date, requested_end_date,
                  covered_start_date, covered_end_date, state,
                  expected_units, completed_units, failure_code, created_at
             FROM measurement_sync_jobs
            WHERE client_id = $1
            ORDER BY created_at DESC
            LIMIT 25`,
          [input.clientId]
        )
      ])
      return { ...freshness, jobs }
    },
    listRecommendations: async (input) => {
      const session = await resolveGoogleAdsControlSession({
        clientId: input.clientId,
        connectionId: input.connectionId
      })
      return listGoogleAdsRecommendations({
        customerId: session.connection.customerId,
        auth: session.auth,
        maxResults: input.maxResults,
        types: input.types,
        includeDismissed: input.includeDismissed
      })
    },
    loadPlan: (actionPlanId, actorId) => getGoogleAdsActionPlanForActor(actionPlanId, actorId),
    getStatus: async plan => actionStatus(plan),
    validatePlan: plan => isExecutableSearchGoogleAdsPlan(plan)
      ? validateSearchGoogleAdsControlPlan(plan)
      : Promise.resolve(foundationValidation(plan)),
    recordValidation: async (plan, validation) => {
      await appendGoogleAdsActionEvent({
        planId: plan.id,
        clientId: plan.clientId,
        actorId: plan.actorId,
        eventType: 'preflight_validated',
        metadata: validationAuditMetadata(validation)
      })
    },
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
    executeAutomatic: (plan, context) => executeSearchGoogleAdsControlAction(plan, {
      actorRole: context.userRole,
      hasWriteScope: true
    }, flags),
    runSearchTermPolicy: (input, context) => runGoogleAdsSearchTermPolicy({
      ...input,
      actorId: context.userId
    }, {
      actorRole: context.userRole,
      hasWriteScope: true
    }, flags),
    runPausePolicy: (input, context) => runGoogleAdsPausePolicy({
      ...input,
      actorId: context.userId
    }, {
      actorRole: context.userRole,
      hasWriteScope: true
    }, flags),
    inspectDrift: (plan, context) => inspectGoogleAdsActionPlanDrift(
      plan, context.userId
    ),
    reverifyResource: (plan, context) => reverifyGoogleAdsActionPlan(
      plan, context.userId
    )
  }
}

export function buildGoogleAdsConfirmDependencies(
  flags: GoogleAdsMcpFlags = googleAdsMcpFlagsFromEnv()
): GoogleAdsConfirmDependencies {
  return {
    loadPlan: (actionPlanId, actorId) => getGoogleAdsActionPlanForActor(actionPlanId, actorId),
    canExecutePlan: isExecutableSearchGoogleAdsPlan,
    approvePlan: (plan, approvalId) => approveGoogleAdsActionPlan({
      id: plan.id,
      clientId: plan.clientId,
      actorId: plan.actorId,
      approvalId
    }),
    executeConfirmed: (plan, context) => executeSearchGoogleAdsControlAction(plan, {
      actorRole: context.userRole,
      hasWriteScope: true
    }, flags)
  }
}
