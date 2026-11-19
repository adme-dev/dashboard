// server/utils/ai/mcp/marketingReviewTools.ts
// Marketing phase 3 tool surfaces over one review service:
//   - staff (MCP staff suite + in-app chat via task4StaffTools): DRAFT-only policy runners, the pending
//     review queue, approve/reject, and execution of an approved plan;
//   - owner (God mode, registered suite): the same Ads review queue/decision/execution plus the department
//     budget allocation review that the owner catalog was missing.
// Every tool is dormant unless MCP_SUITE_CONFIG.marketingDraftReview is true; staff manifests are not even
// projected while it is off. Owner manifests stay in the God-mode catalog (its static execution context
// cannot see runtime flags) but refuse with `disabled` until the switch is on.
import { z } from 'zod'
import { createError } from 'h3'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import type { TrustedSupplementalExecutionServices } from '~~/server/utils/ai/godModeExecution'
import type { McpExecutionDescriptor, McpProjectionContext, McpSuiteFlags, McpToolManifest } from './project'
import { toMcpInputSchema } from './project'
import {
  ExecuteReviewedGoogleAdsPlanSchema,
  ListPendingGoogleAdsReviewsSchema,
  MARKETING_REVIEW_DISABLED,
  ReviewGoogleAdsPlanSchema,
  marketingAdsReviewService
} from '~~/server/utils/googleAds/marketingReview'
import { PauseDraftThresholdsSchema, SearchTermDraftThresholdsSchema } from '~~/server/utils/googleAds/automation'
import { departmentBudgetProposalSchema, departmentBudgetReviewSchema } from '~~/server/utils/ai/marketing/departmentBudgetSchemas'
import { ADS_STAFF_DRAFT_NAMES, ADS_STAFF_REVIEW_NAMES, ADS_STAFF_REVIEW_WRITE_NAMES } from './marketingTask4Names'

const CustomerResource = z.string().regex(/^customers\/\d{1,20}\/(campaigns|adGroups|adGroupAds|adGroupCriteria)\/\d+(?:~\d+)?$/)

/** Staff runners: the existing runner inputs, forced to `mode: 'draft'` (no other value is accepted). */
export const StaffSearchTermDraftSchema = z.strictObject({
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  scope: z.enum(['campaign', 'ad_group']),
  parentResourceName: CustomerResource,
  mode: z.literal('draft').default('draft'),
  draftThresholds: SearchTermDraftThresholdsSchema.optional()
})
export const StaffPauseDraftSchema = z.strictObject({
  clientId: z.string().uuid(),
  connectionId: z.string().uuid(),
  entityType: z.enum(['campaign', 'ad_group', 'ad', 'keyword']),
  resourceName: CustomerResource,
  mode: z.literal('draft').default('draft'),
  draftThresholds: PauseDraftThresholdsSchema.optional()
})
export const OwnerBudgetProposalListToolSchema = z.strictObject({
  clientId: z.string().uuid().optional(),
  includeExpired: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(50)
})

const SCHEMAS: Record<string, z.ZodType> = {
  google_ads_run_search_term_policy: StaffSearchTermDraftSchema,
  google_ads_run_pause_policy: StaffPauseDraftSchema,
  google_ads_list_pending_reviews: ListPendingGoogleAdsReviewsSchema,
  google_ads_review_plan: ReviewGoogleAdsPlanSchema,
  google_ads_execute_reviewed_plan: ExecuteReviewedGoogleAdsPlanSchema,
  marketing_list_budget_proposals: OwnerBudgetProposalListToolSchema,
  marketing_get_budget_proposal: departmentBudgetProposalSchema,
  marketing_review_budget_allocations: departmentBudgetReviewSchema
}

const DESCRIPTIONS: Record<string, string> = {
  google_ads_run_search_term_policy: 'DRAFT ONLY. Evaluate fresh search-term metrics for one campaign or ad group and draft a reviewable negative-keyword plan (wasted terms over the thresholds, protected and positive terms excluded). Never changes Google Ads: returns actionPlanId + requestHash for an independent reviewer.',
  google_ads_run_pause_policy: 'DRAFT ONLY. Evaluate fresh metrics for one campaign, ad group, ad or keyword against pause thresholds and, when they are met, draft a reviewable pause plan. Never changes Google Ads: returns actionPlanId + requestHash for an independent reviewer.',
  google_ads_list_pending_reviews: 'List delegated Google Ads plans awaiting independent review for clients you cover: operation, diff, requester, requestHash, expiry and whether you may review it (never your own). Stored data only; no provider calls.',
  google_ads_review_plan: 'Approve or reject one pending delegated Google Ads plan by its exact requestHash, with a reason and ack:true. You can never review your own plan and must currently cover the client. Records a decision only; it does not change Google Ads.',
  google_ads_execute_reviewed_plan: 'Execute one independently approved Google Ads plan by its exact requestHash with ack:true. Re-validates requester and approver authority, current-state drift and Google validate_only first; a stale or invalid plan is refused and nothing changes. Never retry an unknown outcome blindly.',
  marketing_list_budget_proposals: 'List the marketing department\'s recorded budget allocation proposals awaiting a decision (current amounts, requested amounts, revision, requester, expiry). Stored data only; provider budgets are never changed.',
  marketing_get_budget_proposal: 'Read one marketing budget allocation proposal with its exact revision, review and result.',
  marketing_review_budget_allocations: 'As owner, approve or reject one exact marketing budget allocation proposal revision with a reason and ack:true. You can never approve your own proposal. Records a decision only; the department applies an approved proposal with marketing_set_budget_allocations.'
}

const OWNER_TOOL_NAMES = [
  'google_ads_list_pending_reviews',
  'google_ads_review_plan',
  'google_ads_execute_reviewed_plan',
  'marketing_list_budget_proposals',
  'marketing_get_budget_proposal',
  'marketing_review_budget_allocations'
] as const
const OWNER_MUTATIONS = new Set<string>(['google_ads_review_plan', 'google_ads_execute_reviewed_plan', 'marketing_review_budget_allocations'])

export function marketingReviewToolSchema(name: string): z.ZodType | null {
  return SCHEMAS[name] ?? null
}

function manifest(name: string): McpToolManifest {
  return { name, description: DESCRIPTIONS[name]!, inputSchema: toMcpInputSchema(SCHEMAS[name]!) }
}

/** Staff manifests: none at all unless the phase-3 switch AND the matching Google Ads suite flag are on. */
export function projectStaffAdsReviewManifests(flags: Partial<McpSuiteFlags>): McpToolManifest[] {
  if (flags.marketingDraftReview !== true) return []
  return ADS_STAFF_REVIEW_NAMES
    .filter(name => name === 'google_ads_list_pending_reviews' ? flags.googleAdsRead === true : flags.googleAdsWrite === true)
    .map(manifest)
}

export function isStaffAdsReviewMutation(name: string): boolean {
  return (ADS_STAFF_DRAFT_NAMES as readonly string[]).includes(name)
    || (ADS_STAFF_REVIEW_WRITE_NAMES as readonly string[]).includes(name)
}

function errorResult(error: unknown): ToolResult {
  if (error instanceof z.ZodError) return { ok: false, error: 'Invalid or unsupported typed input', code: 'bad_args' }
  const e = error as { statusCode?: number, statusMessage?: string }
  if (e.statusMessage === MARKETING_REVIEW_DISABLED) {
    return { ok: false, error: 'Marketing draft and review flows are not enabled.', code: 'disabled' }
  }
  return {
    ok: false,
    error: e.statusMessage ?? 'Marketing review service unavailable; inspect the stored plan before retrying.',
    code: e.statusCode === 403 ? 'forbidden' : e.statusCode === 409 ? 'conflict' : e.statusCode === 404 ? 'not_found' : 'handler_error'
  }
}

/** Draft runner for staff: fresh ads_plan authority + exact mapping, then the runner in `draft` mode. */
async function runStaffDraft(name: string, args: unknown, ctx: ToolContext, flags: Partial<McpSuiteFlags>): Promise<ToolResult> {
  const searchTerm = name === 'google_ads_run_search_term_policy'
  const input = (searchTerm ? StaffSearchTermDraftSchema : StaffPauseDraftSchema).parse(args)
  if (!ctx.event) throw createError({ statusCode: 403, statusMessage: 'Authenticated request required' })
  if (ctx.clientScope && ctx.clientScope !== input.clientId) throw createError({ statusCode: 403, statusMessage: 'Client scope mismatch' })
  const [{ assertMarketingCapabilityAtBoundary }, access, { isNativeMarketingContext }, { mcpGoogleAdsControlAuthority }, automation] = await Promise.all([
    import('~~/server/utils/ai/marketing/reviewAuthority'),
    import('~~/server/utils/ai/marketing/googleAdsAccess'),
    import('~~/server/utils/ai/marketing/nativeAuthority'),
    import('./googleAdsSearchTools'),
    import('~~/server/utils/googleAds/automation')
  ])
  const native = isNativeMarketingContext(ctx)
  await assertMarketingCapabilityAtBoundary(ctx.event, ctx.userId, input.clientId, 'ads_plan', {
    scopes: ctx.mcpScopes ?? [],
    requireWriteScope: !native
  })
  const mapping = await access.assertGoogleAdsConnection(ctx, input.clientId, input.connectionId)
  access.assertGoogleAdsResourceCustomers(input, mapping.customerId)
  const authority = mcpGoogleAdsControlAuthority(ctx, true)
  // Drafts are only ever delegated proposals: the planner then persists review_policy=delegated_marketing.
  if (!authority.delegatedPlanning) throw createError({ statusCode: 403, statusMessage: 'Delegated ads_plan authority required' })
  const runnerFlags = { read: flags.googleAdsRead === true, write: flags.googleAdsWrite === true, automation: false, destructive: false }
  const base = { ...input, actorId: ctx.userId, mode: 'draft' as const, source: native ? 'chat' as const : 'mcp' as const }
  const data = searchTerm
    ? await automation.runGoogleAdsSearchTermPolicy(base, authority, runnerFlags)
    : await automation.runGoogleAdsPausePolicy(base, authority, runnerFlags)
  if (data.mode !== 'draft' || data.executed !== false) {
    // Defence in depth: a staff draft run must never report an execution.
    return { ok: false, error: 'Draft run returned an unexpected execution result.', code: 'handler_error' }
  }
  return { ok: true, data }
}

/** Staff dispatch (MCP staff suite and in-app chat). Admission was already evaluated by the caller. */
export async function executeStaffAdsReviewTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  try {
    const { resolveMcpRuntimeConfig } = await import('./runtimeConfig')
    const flags = resolveMcpRuntimeConfig(ctx.event).suiteFlags
    if (!flags.marketingDraftReview) return { ok: false, error: 'Marketing draft and review flows are not enabled.', code: 'disabled' }
    if ((ADS_STAFF_DRAFT_NAMES as readonly string[]).includes(name)) return await runStaffDraft(name, args, ctx, flags)
    if (name === 'google_ads_list_pending_reviews') return { ok: true, data: await marketingAdsReviewService.listPending(ctx, args) }
    if (name === 'google_ads_review_plan') return { ok: true, data: await marketingAdsReviewService.review(ctx, args) }
    if (name === 'google_ads_execute_reviewed_plan') {
      const data = await marketingAdsReviewService.execute(ctx, args)
      return data.ok === false && data.executed === false && !('status' in data)
        ? { ok: false, error: String(data.message), code: 'validation_failed', details: { code: data.code } }
        : { ok: true, data }
    }
    return { ok: false, error: 'Unknown review tool', code: 'not_found' }
  } catch (error) {
    return errorResult(error)
  }
}

// ---------------------------------------------------------------------------------------------------
// Owner God-mode suite

async function runOwnerTool(name: string, args: unknown, ctx: ToolContext, services?: TrustedSupplementalExecutionServices): Promise<ToolResult> {
  try {
    const dispatch = services ? () => services.markDispatched() : undefined
    if (name.startsWith('marketing_')) {
      const { ownerBudgetReviewService } = await import('~~/server/utils/ai/marketing/ownerBudgetReview')
      if (name === 'marketing_list_budget_proposals') return { ok: true, data: await ownerBudgetReviewService.list(ctx, args) }
      if (name === 'marketing_get_budget_proposal') return { ok: true, data: await ownerBudgetReviewService.get(ctx, args) }
      return { ok: true, data: await ownerBudgetReviewService.review(ctx, args, dispatch) }
    }
    if (name === 'google_ads_list_pending_reviews') return { ok: true, data: await marketingAdsReviewService.listPending(ctx, args) }
    if (name === 'google_ads_review_plan') return { ok: true, data: await marketingAdsReviewService.review(ctx, args, dispatch) }
    const data = await marketingAdsReviewService.execute(ctx, args, dispatch)
    if (data.ok === false && data.executed === false && !('status' in data)) {
      // Refused before dispatch (drift / validate_only failure): a clean, non-ambiguous failure.
      return { ok: false, error: String(data.message), code: 'validation_failed', details: { code: data.code } }
    }
    return data.ok ? { ok: true, data } : { ok: false, error: String(data.message ?? 'Google Ads execution did not succeed; inspect the plan status.'), code: 'execution_blocked', details: { status: 'status' in data ? data.status : null } }
  } catch (error) {
    return errorResult(error)
  }
}

function ownerTool(name: string): AiTool<unknown> {
  const mutates = OWNER_MUTATIONS.has(name)
  return {
    name,
    description: DESCRIPTIONS[name]!,
    parameters: SCHEMAS[name]! as z.ZodType<unknown>,
    ...(name.startsWith('google_ads_') ? { requiredPermission: 'MEDIA_BUYING' as const } : {}),
    mutates,
    ...(name === 'google_ads_execute_reviewed_plan' ? { riskTier: 'rich_confirm' as const } : {}),
    returnsUntrusted: !mutates,
    handler: mutates
      ? async () => ({ ok: false, error: 'Owner review decisions require the authenticated owner MCP execution coordinator.' })
      : async (args, ctx) => runOwnerTool(name, args, ctx)
  }
}

/** Owner-only: projected solely into the God-mode union (governanceBypass), never to staff. */
export function projectOwnerMarketingReviewMcpSuite(context: McpProjectionContext): McpToolManifest[] {
  return context.governanceBypass ? OWNER_TOOL_NAMES.map(manifest) : []
}

export function resolveOwnerMarketingReviewMcpExecutions(context: McpProjectionContext): McpExecutionDescriptor[] {
  if (!context.governanceBypass) return []
  return OWNER_TOOL_NAMES.map((name) => {
    const tool = ownerTool(name)
    if (!tool.mutates) return { name, canonicalName: name, kind: 'supplemental' as const, tool }
    return {
      name,
      canonicalName: name,
      kind: 'supplemental' as const,
      // Execution reaches Google; decisions are local rows committed after the dispatch checkpoint.
      executionClass: name === 'google_ads_execute_reviewed_plan' ? 'external-provider' as const : 'internal-http' as const,
      // These calls ARE the explicit, hash-bound human confirmation. What the owner bypasses is the
      // department reviewer role requirement, so the God-mode audit records `permission`, not `confirmation`.
      godModeBypassedControls: ['permission'] as const,
      executeSupplemental: (args: unknown, ctx: ToolContext, services: TrustedSupplementalExecutionServices) =>
        runOwnerTool(name, args, ctx, services),
      tool
    }
  })
}

export const OWNER_MARKETING_REVIEW_TOOL_NAMES: readonly string[] = OWNER_TOOL_NAMES
