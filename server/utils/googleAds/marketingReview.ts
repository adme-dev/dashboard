// server/utils/googleAds/marketingReview.ts
// Marketing phase 3: draft → approve → execute for delegated Google Ads plans.
//
// One review service for every surface (staff MCP, in-app chat, owner God mode):
//   draft    — staff (capability ads_plan) run the search-term / pause policy runners in DRAFT mode; the
//              runner persists a `delegated_marketing` proposal plan and never calls the executor.
//   review   — an approver who is NOT the requester and is freshly authorized for the client approves or
//              rejects the exact plan hash with a reason. Approval policy comes only from the phase-2 seam
//              `requiredApprovalForFamily()`.
//   execute  — an approved plan runs only through the existing reviewed-plan executor
//              (executeSearchGoogleAdsControlAction) after fresh re-validation: requester + approver
//              authority, exact hash, current-state drift (fingerprint) and Google validate_only.
//
// Dormant: every entry point refuses unless MCP_SUITE_CONFIG.marketingDraftReview is true (default off).
import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { GoogleAdsActionPlan } from './contracts'
import type { GoogleAdsExecutionOutcome } from './actionExecutor'
import type { GoogleAdsControlAuthority, GoogleAdsControlFlags } from './searchRuntime'
import {
  checkMarketingExecutionLimits,
  marketingAdsActionFamilyForOperation,
  requiredApprovalForFamily
} from './marketingGovernanceSeams'

export const MARKETING_REVIEW_DISABLED = 'MARKETING_DRAFT_REVIEW_DISABLED'

const Uuid = z.string().uuid()
const RequestHash = z.string().regex(/^[a-f0-9]{64}$/)

export const ListPendingGoogleAdsReviewsSchema = z.strictObject({
  clientId: Uuid.optional(),
  limit: z.number().int().min(1).max(100).default(50)
})
export const ReviewGoogleAdsPlanSchema = z.strictObject({
  actionPlanId: Uuid,
  expectedRequestHash: RequestHash,
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(5).max(1000),
  /** The call itself is the human confirmation; it must be explicit. */
  ack: z.literal(true)
})
export const ExecuteReviewedGoogleAdsPlanSchema = z.strictObject({
  actionPlanId: Uuid,
  expectedRequestHash: RequestHash,
  ack: z.literal(true)
})

export type ReviewActorKind = 'staff' | 'owner'

export interface MarketingAdsReviewDependencies {
  enabled(event: H3Event | undefined): Promise<boolean>
  flags(event: H3Event | undefined): Promise<GoogleAdsControlFlags>
  resolveStaff(event: H3Event, userId: string, scopes: Iterable<string>): Promise<ToolContext>
  isActiveOwner(userId: string): Promise<boolean>
  coversClient(ctx: ToolContext, clientId: string): Promise<boolean>
  /** Today's independent reviewer rule (ADMIN or MARKETING_MANAGEMENT, covers client, not requester). */
  requireIndependentReviewer(event: H3Event, input: { requesterId: string, clientId: string, reviewerId: string }): Promise<unknown>
  /** Requester still holds ads_plan for the client and the exact account mapping still exists. */
  assertRequester(event: H3Event, plan: GoogleAdsActionPlan): Promise<void>
  listPendingIds(input: { clientIds: string[] | null, clientId: string | null, limit: number }): Promise<Array<{ id: string, client_id: string }>>
  loadPlan(id: string): Promise<GoogleAdsActionPlan | null>
  recordDecision(plan: GoogleAdsActionPlan, reviewerId: string, decision: 'approve' | 'reject', reason: string, actorKind: ReviewActorKind): Promise<GoogleAdsActionPlan | null>
  validate(plan: GoogleAdsActionPlan): Promise<Record<string, unknown>>
  execute(plan: GoogleAdsActionPlan, authority: GoogleAdsControlAuthority, flags: GoogleAdsControlFlags): Promise<GoogleAdsExecutionOutcome>
  limits: typeof checkMarketingExecutionLimits
}

function forbidden(statusMessage: string): never {
  throw createError({ statusCode: 403, statusMessage })
}
function conflict(statusMessage: string): never {
  throw createError({ statusCode: 409, statusMessage })
}

/** Owner God mode contexts are the only non-delegated Ads contexts (see googleAdsAccess.delegatedAdsContext). */
export function reviewActorKind(ctx: ToolContext): ReviewActorKind {
  return ctx.mcpStaffAuthority !== 'fresh' && ctx.userRole === 'owner' && !!ctx.godModeExecutionKey ? 'owner' : 'staff'
}

const defaultDependencies: MarketingAdsReviewDependencies = {
  // Lazy: runtimeConfig → marketingPolicy → registry would otherwise form an import cycle.
  enabled: async (event) => {
    const { resolveMcpRuntimeConfig } = await import('~~/server/utils/ai/mcp/runtimeConfig')
    return resolveMcpRuntimeConfig(event).suiteFlags.marketingDraftReview === true
  },
  flags: async (event) => {
    const { resolveMcpRuntimeConfig } = await import('~~/server/utils/ai/mcp/runtimeConfig')
    const suite = resolveMcpRuntimeConfig(event).suiteFlags
    // Reviewed plans never run as automation and never permit destructive operations.
    return { read: suite.googleAdsRead === true, write: suite.googleAdsWrite === true, automation: false, destructive: false }
  },
  resolveStaff: async (event, userId, scopes) => {
    const { resolveMcpStaffContext } = await import('~~/server/utils/ai/mcp/staffAuthority')
    return resolveMcpStaffContext(event, userId, scopes)
  },
  isActiveOwner: async (userId) => {
    const { queryOneFresh } = await import('~~/server/utils/db')
    const row = await queryOneFresh<{ id: string }>(
      `SELECT id FROM team_members WHERE id = $1 AND is_active = TRUE AND user_role = 'owner' LIMIT 1`,
      [userId]
    )
    return !!row
  },
  coversClient: async (ctx, clientId) => {
    const { freshContextCoversClient } = await import('~~/server/utils/ai/marketing/reviewAuthority')
    return freshContextCoversClient(ctx, clientId)
  },
  requireIndependentReviewer: async (event, input) => {
    const { requireIndependentMarketingReviewer } = await import('~~/server/utils/ai/marketing/reviewAuthority')
    return requireIndependentMarketingReviewer(event, input)
  },
  assertRequester: async (event, plan) => {
    const [{ assertMarketingCapabilityAtBoundary }, { assertGoogleAdsConnection }] = await Promise.all([
      import('~~/server/utils/ai/marketing/reviewAuthority'),
      import('~~/server/utils/ai/marketing/googleAdsAccess')
    ])
    const requester = await assertMarketingCapabilityAtBoundary(event, plan.actorId, plan.clientId, 'ads_plan')
    await assertGoogleAdsConnection(requester, plan.clientId, plan.connectionId, plan.customerId)
  },
  listPendingIds: async ({ clientIds, clientId, limit }) => {
    const { queryRowsFresh } = await import('~~/server/utils/db')
    return queryRowsFresh<{ id: string, client_id: string }>(
      `SELECT p.id, p.client_id
         FROM google_ads_action_plans p
         JOIN agency_clients c ON c.id = p.client_id AND c.is_active = TRUE
        WHERE p.review_policy = 'delegated_marketing'
          AND p.status = 'pending_approval'
          AND p.expires_at > NOW()
          AND ($1::uuid[] IS NULL OR p.client_id = ANY($1::uuid[]))
          AND ($2::uuid IS NULL OR p.client_id = $2::uuid)
        ORDER BY p.created_at DESC
        LIMIT $3`,
      [clientIds, clientId, limit]
    )
  },
  loadPlan: async (id) => {
    const [{ queryOneFresh }, { getGoogleAdsActionPlan }] = await Promise.all([
      import('~~/server/utils/db'),
      import('./actionStore')
    ])
    const row = await queryOneFresh<{ client_id: string }>(
      `SELECT client_id FROM google_ads_action_plans WHERE id = $1 AND review_policy = 'delegated_marketing'`,
      [id]
    )
    return row ? getGoogleAdsActionPlan(id, row.client_id, { queryOne: queryOneFresh }) : null
  },
  recordDecision: async (plan, reviewerId, decision, reason, actorKind) => {
    const [{ transaction, queryOneFresh }, { getGoogleAdsActionPlan }] = await Promise.all([
      import('~~/server/utils/db'),
      import('./actionStore')
    ])
    const updated = await transaction(async (db) => {
      // actor_id <> reviewer is enforced here AND by the 484 row trigger (independent reviewer required).
      const result = await db.query(
        `UPDATE google_ads_action_plans
            SET status = $3, reviewed_by = $4, reviewed_at = NOW(), rejection_reason = $5
          WHERE id = $1 AND request_hash = $2 AND review_policy = 'delegated_marketing'
            AND status = 'pending_approval' AND expires_at > NOW() AND actor_id <> $4
          RETURNING id`,
        [plan.id, plan.requestHash, decision === 'approve' ? 'approved' : 'cancelled', reviewerId,
          decision === 'reject' ? reason : null]
      )
      if (!result.rows.length) return false
      await db.query(
        `INSERT INTO google_ads_action_events (plan_id, client_id, actor_id, event_type, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [plan.id, plan.clientId, reviewerId, decision === 'approve' ? 'approved' : 'rejected',
          JSON.stringify({ requestHash: plan.requestHash, reason, reviewerKind: actorKind, flow: 'marketing_draft_review' })]
      )
      return true
    })
    return updated ? getGoogleAdsActionPlan(plan.id, plan.clientId, { queryOne: queryOneFresh }) : null
  },
  validate: async (plan) => {
    const { validateSearchGoogleAdsControlPlan } = await import('./searchRuntime')
    return validateSearchGoogleAdsControlPlan(plan)
  },
  execute: async (plan, authority, flags) => {
    const { executeSearchGoogleAdsControlAction } = await import('./searchRuntime')
    return executeSearchGoogleAdsControlAction(plan, authority, flags)
  },
  limits: checkMarketingExecutionLimits
}

function planSummary(plan: GoogleAdsActionPlan, viewerId: string, canReview: boolean) {
  const family = marketingAdsActionFamilyForOperation(plan.operation)
  return {
    actionPlanId: plan.id,
    clientId: plan.clientId,
    customerId: plan.customerId,
    operation: plan.operation,
    family,
    resourceType: plan.resourceType,
    resourceName: plan.resourceName,
    riskTier: plan.riskTier,
    diff: plan.diff.slice(0, 50),
    diffTruncated: plan.diff.length > 50,
    requestHash: plan.requestHash,
    requesterId: plan.actorId,
    source: plan.source,
    status: plan.status,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
    isMine: plan.actorId.toLowerCase() === viewerId.toLowerCase(),
    canReview,
    requiredApproval: requiredApprovalForFamily(family, plan.riskTier)
  }
}

export function createMarketingAdsReviewService(overrides: Partial<MarketingAdsReviewDependencies> = {}) {
  const deps: MarketingAdsReviewDependencies = { ...defaultDependencies, ...overrides }

  async function assertEnabled(ctx: ToolContext) {
    if (!await deps.enabled(ctx.event)) forbidden(MARKETING_REVIEW_DISABLED)
  }

  /** Fresh identity of the caller: active owner (God mode) or freshly resolved marketing staff. */
  async function resolveCaller(ctx: ToolContext): Promise<{ kind: ReviewActorKind, fresh: ToolContext | null }> {
    if (!ctx.event) forbidden('Authenticated request required')
    if (reviewActorKind(ctx) === 'owner') {
      if (!await deps.isActiveOwner(ctx.userId)) forbidden('Active owner authority required')
      return { kind: 'owner', fresh: null }
    }
    const fresh = await deps.resolveStaff(ctx.event!, ctx.userId, ctx.mcpScopes ?? [])
    if (!(fresh.marketingCapabilities ?? []).includes('ads_plan')) forbidden('MARKETING_CAPABILITY_REQUIRED')
    return { kind: 'staff', fresh: { ...fresh, clientScope: ctx.clientScope } }
  }

  /**
   * The approver check, driven by the phase-2 seam. The requester never approves their own plan; the
   * owner may approve any other requester's plan; staff need today's independent reviewer authority.
   */
  async function assertApprover(event: H3Event, plan: GoogleAdsActionPlan, reviewerId: string, kind: ReviewActorKind) {
    const required = requiredApprovalForFamily(marketingAdsActionFamilyForOperation(plan.operation), plan.riskTier)
    if (reviewerId.toLowerCase() === plan.actorId.toLowerCase()) {
      forbidden('Requesters cannot approve their own plan')
    }
    if (kind === 'owner') {
      if (!required.ownerMayApprove || !await deps.isActiveOwner(reviewerId)) forbidden('Owner approval is not permitted for this plan')
      return
    }
    // Owner reviewers recorded on a plan are re-verified as active owners at execution time.
    if (await deps.isActiveOwner(reviewerId) && required.ownerMayApprove) return
    await deps.requireIndependentReviewer(event, { requesterId: plan.actorId, clientId: plan.clientId, reviewerId })
  }

  async function loadForCaller(ctx: ToolContext, id: string, caller: { kind: ReviewActorKind, fresh: ToolContext | null }) {
    const plan = await deps.loadPlan(Uuid.parse(id))
    if (!plan || plan.reviewPolicy !== 'delegated_marketing') {
      throw createError({ statusCode: 404, statusMessage: 'Review plan not found' })
    }
    if (ctx.clientScope && ctx.clientScope !== plan.clientId) forbidden('Client scope mismatch')
    if (caller.kind === 'staff' && !await deps.coversClient(caller.fresh!, plan.clientId)) {
      // Not 404: callers must not probe other clients' plan ids, but scope denials stay explicit.
      forbidden('MARKETING_CLIENT_NOT_ASSIGNED')
    }
    return plan
  }

  return {
    async listPending(ctx: ToolContext, raw: unknown) {
      await assertEnabled(ctx)
      const input = ListPendingGoogleAdsReviewsSchema.parse(raw ?? {})
      const caller = await resolveCaller(ctx)
      const clientId = input.clientId ?? ctx.clientScope ?? null
      if (ctx.clientScope && input.clientId && input.clientId !== ctx.clientScope) forbidden('Client scope mismatch')
      let clientIds: string[] | null = null
      if (caller.kind === 'staff') {
        const scope = caller.fresh!.assistantScope
        clientIds = scope?.clientAccessMode === 'all_active' ? null : [...(scope?.assignedClientIds ?? [])]
        if (clientIds && clientIds.length === 0) return { reviews: [], more: false, viewer: caller.kind }
      }
      const rows = await deps.listPendingIds({ clientIds, clientId, limit: input.limit + 1 })
      const reviewerGroups = caller.fresh?.permissionGroups ?? []
      const staffMayReview = caller.kind === 'owner'
        || reviewerGroups.includes('ADMIN') || reviewerGroups.includes('MARKETING_MANAGEMENT')
      const reviews = []
      for (const row of rows.slice(0, input.limit)) {
        const plan = await deps.loadPlan(row.id)
        if (!plan || plan.status !== 'pending_approval') continue
        if (caller.kind === 'staff' && !await deps.coversClient(caller.fresh!, plan.clientId)) continue
        const mine = plan.actorId.toLowerCase() === ctx.userId.toLowerCase()
        reviews.push(planSummary(plan, ctx.userId, staffMayReview && !mine))
      }
      return { reviews, more: rows.length > input.limit, viewer: caller.kind, providerCalls: 0 }
    },

    async review(ctx: ToolContext, raw: unknown, beforeCommit?: () => Promise<void>) {
      await assertEnabled(ctx)
      const input = ReviewGoogleAdsPlanSchema.parse(raw)
      const caller = await resolveCaller(ctx)
      if (caller.kind === 'staff' && caller.fresh!.assistantReadOnly) forbidden('MARKETING_ROLE_READ_ONLY')
      const plan = await loadForCaller(ctx, input.actionPlanId, caller)
      if (plan.requestHash !== input.expectedRequestHash) conflict('Plan changed; re-read it before reviewing')
      if (plan.status !== 'pending_approval' || Date.parse(plan.expiresAt) <= Date.now()) {
        conflict('Plan expired or already reviewed')
      }
      await assertApprover(ctx.event!, plan, ctx.userId, caller.kind)
      // An approval is only meaningful while the requester still holds the capability and mapping.
      if (input.decision === 'approve') await deps.assertRequester(ctx.event!, plan)
      await beforeCommit?.()
      const updated = await deps.recordDecision(plan, ctx.userId, input.decision, input.reason, caller.kind)
      if (!updated) conflict('Plan expired or already reviewed')
      return {
        ...planSummary(updated!, ctx.userId, false),
        decision: input.decision,
        reviewedBy: ctx.userId,
        reviewerKind: caller.kind,
        executed: false,
        nextStep: input.decision === 'approve'
          ? 'Approved. Execute with google_ads_execute_reviewed_plan; it re-validates the plan against Google first.'
          : 'Rejected. Nothing changed in Google Ads.'
      }
    },

    async execute(ctx: ToolContext, raw: unknown, beforeDispatch?: () => Promise<void>) {
      await assertEnabled(ctx)
      const input = ExecuteReviewedGoogleAdsPlanSchema.parse(raw)
      const caller = await resolveCaller(ctx)
      if (caller.kind === 'staff' && caller.fresh!.assistantReadOnly) forbidden('MARKETING_ROLE_READ_ONLY')
      const flags = await deps.flags(ctx.event)
      if (!flags.write) forbidden('Google Ads writes disabled')
      const plan = await loadForCaller(ctx, input.actionPlanId, caller)
      if (plan.requestHash !== input.expectedRequestHash) conflict('Plan changed; re-read it before executing')
      if (plan.status !== 'approved' || !plan.reviewedBy || Date.parse(plan.expiresAt) <= Date.now()) {
        conflict('Plan is not an unexpired approved plan; inspect its current status')
      }
      if (plan.reviewedBy.toLowerCase() === plan.actorId.toLowerCase()) forbidden('Independent approval required')
      // The executor is never the requester (also enforced by the executor's DB claim).
      if (ctx.userId.toLowerCase() === plan.actorId.toLowerCase()) forbidden('Requesters cannot execute their own plan')
      // Re-validate every authority at execute time: recorded approver, current executor, requester.
      await assertApprover(ctx.event!, plan, plan.reviewedBy, (await deps.isActiveOwner(plan.reviewedBy)) ? 'owner' : 'staff')
      await assertApprover(ctx.event!, plan, ctx.userId, caller.kind)
      await deps.assertRequester(ctx.event!, plan)
      const limits = await deps.limits(plan)
      if (limits.allowed === false) forbidden(limits.message)
      // Drift + provider re-validation: current-state fingerprint must match the reviewed plan and Google
      // must accept the exact mutation in validate_only mode, otherwise nothing is dispatched.
      const validation = await deps.validate(plan)
      if (validation.valid !== true) {
        return {
          ok: false,
          executed: false,
          actionPlanId: plan.id,
          code: typeof validation.code === 'string' ? validation.code : 'validation_failed',
          message: 'The approved plan no longer validates (drift or provider rejection). Draft a fresh plan; nothing was changed.'
        }
      }
      const authority: GoogleAdsControlAuthority = caller.kind === 'owner'
        ? { actorRole: 'owner', hasWriteScope: true, delegatedPlanning: false, reviewedPlanId: plan.id, executorId: ctx.userId }
        : {
            actorRole: caller.fresh!.userRole,
            permissionGroups: caller.fresh!.permissionGroups ?? [],
            delegatedPlanning: (caller.fresh!.permissionGroups ?? []).includes('MARKETING_MANAGEMENT'),
            hasWriteScope: true,
            reviewedPlanId: plan.id,
            executorId: ctx.userId
          }
      await beforeDispatch?.()
      const outcome = await deps.execute(plan, authority, flags)
      return { ...outcome, executed: outcome.ok, actionPlanId: plan.id, revalidated: true }
    }
  }
}

export const marketingAdsReviewService = createMarketingAdsReviewService()
