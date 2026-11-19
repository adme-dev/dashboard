/* eslint-disable @typescript-eslint/no-explicit-any -- Partial H3 events and dependency doubles exercise review authority boundaries. */
// Marketing phase 3 (draft → approve): draft-only runners, independent review, scope, owner review,
// execute-time re-validation and dormancy.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { runGoogleAdsPausePolicy, runGoogleAdsSearchTermPolicy } from '~~/server/utils/googleAds/automation'
import { createMarketingAdsReviewService, type MarketingAdsReviewDependencies } from '~~/server/utils/googleAds/marketingReview'
import { requiredApprovalForFamily, checkMarketingExecutionLimits } from '~~/server/utils/googleAds/marketingGovernanceSeams'
import { createOwnerBudgetReviewService } from '~~/server/utils/ai/marketing/ownerBudgetReview'
import {
  StaffSearchTermDraftSchema,
  executeStaffAdsReviewTool,
  projectOwnerMarketingReviewMcpSuite,
  projectStaffAdsReviewManifests,
  resolveOwnerMarketingReviewMcpExecutions
} from '~~/server/utils/ai/mcp/marketingReviewTools'
import { isLegacyAdsMutation, isTask4WriteTool } from '~~/server/utils/ai/mcp/marketingTask4Names'
import { evaluateStaffToolAdmission } from '~~/server/utils/ai/mcp/marketingPolicy'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const clientId = '11111111-1111-4111-8111-111111111111'
const otherClient = '99999999-9999-4999-8999-999999999999'
const connectionId = '22222222-2222-4222-8222-222222222222'
const requester = '33333333-3333-4333-8333-333333333333'
const reviewer = '44444444-4444-4444-8444-444444444444'
const owner = '66666666-6666-4666-8666-666666666666'
const planId = '55555555-5555-4555-8555-555555555555'
const hash = 'a'.repeat(64)
const event = { context: {} } as any

function plan(overrides: Partial<GoogleAdsActionPlan> = {}): GoogleAdsActionPlan {
  return {
    id: planId, clientId, connectionId, customerId: '1234567890', actorId: requester, source: 'mcp',
    toolName: 'google_ads_run_search_term_policy', resourceType: 'negative_keyword', resourceName: null,
    operation: 'add_negative_keywords', currentState: {}, desiredState: {}, currentStateFingerprint: 'b'.repeat(64),
    diff: [], providerOperations: [{ service: 'campaignCriteria', operations: [] }] as any, riskTier: 'confirm',
    executionMode: 'proposal', policyVersion: 'google-ads-v1', policyDecision: { allowed: true, riskTier: 'confirm', executionMode: 'proposal' },
    requestHash: hash, idempotencyKey: 'draft:adhoc:x', status: 'pending_approval', reviewPolicy: 'delegated_marketing',
    reviewedBy: null, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(),
    ...overrides
  } as GoogleAdsActionPlan
}

function staffCtx(userId: string, extra: Partial<ToolContext> = {}): ToolContext {
  return {
    userId, userRole: 'member', permissionGroups: ['MARKETING_MANAGEMENT'], mcpStaffAuthority: 'fresh',
    marketingCapabilities: ['ads_plan'], mcpScopes: new Set(['mcp:read', 'mcp:write']), source: 'mcp', event,
    assistantScope: { departmentIds: [], clientAccessMode: 'assigned', assignedClientIds: [clientId], catalogReleaseIds: [] },
    ...extra
  } as ToolContext
}
const ownerCtx = { userId: owner, userRole: 'owner', permissionGroups: [], source: 'mcp', godModeExecutionKey: `mcp:${'c'.repeat(64)}`, event } as ToolContext

function deps(overrides: Partial<MarketingAdsReviewDependencies> = {}) {
  let stored = plan()
  const d: MarketingAdsReviewDependencies = {
    enabled: vi.fn().mockResolvedValue(true),
    flags: vi.fn().mockResolvedValue({ read: true, write: true, automation: false, destructive: false }),
    resolveStaff: vi.fn(async (_e, userId) => staffCtx(userId)),
    isActiveOwner: vi.fn(async id => id === owner),
    coversClient: vi.fn(async (ctx, id) => ctx.assistantScope?.assignedClientIds.includes(id) ?? false),
    requireIndependentReviewer: vi.fn(async (_e, input) => {
      if (input.reviewerId === input.requesterId) throw Object.assign(new Error('self'), { statusCode: 403 })
      return {}
    }),
    assertRequester: vi.fn().mockResolvedValue(undefined),
    listPendingIds: vi.fn().mockResolvedValue([{ id: planId, client_id: clientId }]),
    loadPlan: vi.fn(async () => stored),
    recordDecision: vi.fn(async (p, reviewerId, decision) => {
      stored = { ...p, status: decision === 'approve' ? 'approved' : 'cancelled', reviewedBy: reviewerId }
      return stored
    }),
    validate: vi.fn().mockResolvedValue({ valid: true }),
    execute: vi.fn().mockResolvedValue({ ok: true, status: 'verified' }),
    limits: checkMarketingExecutionLimits,
    ...overrides
  }
  const setPlan = (p: GoogleAdsActionPlan) => {
    stored = p
  }
  return { d, setPlan }
}
const review = (decision: 'approve' | 'reject' = 'approve') =>
  ({ actionPlanId: planId, expectedRequestHash: hash, decision, reason: 'Wasted spend, no conversions', ack: true })

describe('draft-only policy runners', () => {
  const parentResourceName = 'customers/1234567890/campaigns/10'
  const runnerDeps = (execute = vi.fn()) => ({
    resolveSession: vi.fn().mockResolvedValue({ connection: { customerId: '1234567890' }, auth: {} }),
    loadPolicy: vi.fn().mockResolvedValue(null),
    recentAction: vi.fn().mockResolvedValue(null),
    query: vi.fn()
      .mockResolvedValueOnce({ rows: [{
        searchTermView: { searchTerm: 'free car', status: 'NONE', adGroup: 'customers/1234567890/adGroups/2' },
        campaign: { resourceName: parentResourceName },
        metrics: { impressions: 100, clicks: 9, costMicros: 40_000_000, conversions: 0 }
      }], more: 0 })
      .mockResolvedValueOnce({ rows: [], more: 0 }),
    plan: vi.fn().mockResolvedValue({ id: planId, executionMode: 'proposal', status: 'pending_approval', requestHash: hash, expiresAt: 'x', policyDecision: { allowed: true } }),
    execute,
    event: vi.fn()
  })

  it('drafts a proposal without a stored policy or the automation flag and never executes', async () => {
    const execute = vi.fn()
    const d = runnerDeps(execute)
    const result = await runGoogleAdsSearchTermPolicy({
      clientId, connectionId, actorId: requester, scope: 'campaign', parentResourceName, mode: 'draft'
    }, { actorRole: 'member', hasWriteScope: true, delegatedPlanning: true }, { read: true, write: true, automation: false, destructive: false }, d as any)
    expect(result).toMatchObject({ mode: 'draft', drafted: true, executed: false, actionPlanId: planId, candidates: ['free car'] })
    expect(d.plan).toHaveBeenCalledWith(expect.objectContaining({ requestedMode: 'proposal', source: 'mcp' }), expect.anything(), expect.anything())
    expect(d.event).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'automation_drafted' }))
    expect(execute).not.toHaveBeenCalled()
  })

  it('refuses to report a draft when the planner did not produce a pending proposal', async () => {
    const execute = vi.fn()
    const d = runnerDeps(execute)
    d.plan.mockResolvedValue({ id: planId, executionMode: 'automatic', status: 'planned', policyDecision: { allowed: true } })
    const result = await runGoogleAdsSearchTermPolicy({
      clientId, connectionId, actorId: requester, scope: 'campaign', parentResourceName, mode: 'draft'
    }, { actorRole: 'member', hasWriteScope: true }, { read: true, write: true, automation: true, destructive: false }, d as any)
    expect(result).toMatchObject({ drafted: false, executed: false, reason: 'plan_blocked' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('execute mode keeps requiring a stored policy and the automation flag', async () => {
    const d = runnerDeps()
    await expect(runGoogleAdsPausePolicy({ clientId, connectionId, actorId: requester, entityType: 'campaign', resourceName: parentResourceName },
      { actorRole: 'member', hasWriteScope: true }, { read: true, write: true, automation: false, destructive: false }, d as any))
      .resolves.toMatchObject({ executed: false, reason: 'feature_disabled' })
  })

  it('staff runner schemas accept only draft mode', () => {
    const base = { clientId, connectionId, scope: 'campaign', parentResourceName }
    expect(StaffSearchTermDraftSchema.parse(base).mode).toBe('draft')
    expect(StaffSearchTermDraftSchema.safeParse({ ...base, mode: 'execute' }).success).toBe(false)
  })

  it('draft runners are reviewed staff writes, not legacy self-approvable mutations', () => {
    expect(isLegacyAdsMutation('google_ads_run_search_term_policy')).toBe(false)
    expect(isLegacyAdsMutation('propose_google_ads_action')).toBe(true)
    expect(isTask4WriteTool('google_ads_run_pause_policy')).toBe(true)
    expect(isTask4WriteTool('google_ads_review_plan')).toBe(true)
    expect(isTask4WriteTool('google_ads_list_pending_reviews')).toBe(false)
    const reporter = staffCtx(requester, { marketingCapabilities: ['reporting'] })
    expect(evaluateStaffToolAdmission('google_ads_run_search_term_policy', reporter).allowed).toBe(false)
    expect(evaluateStaffToolAdmission('google_ads_run_search_term_policy', staffCtx(requester)).allowed).toBe(true)
  })
})

describe('independent review of delegated Ads plans', () => {
  it('refuses self-approval by the requester', async () => {
    const { d } = deps()
    const service = createMarketingAdsReviewService(d)
    await expect(service.review(staffCtx(requester), review())).rejects.toMatchObject({ statusCode: 403 })
    expect(d.recordDecision).not.toHaveBeenCalled()
  })

  it('records an independent approval through the phase-2 seam rule', async () => {
    const { d } = deps()
    const result = await createMarketingAdsReviewService(d).review(staffCtx(reviewer), review())
    expect(result).toMatchObject({ decision: 'approve', reviewedBy: reviewer, reviewerKind: 'staff', executed: false })
    expect(d.requireIndependentReviewer).toHaveBeenCalledWith(event, { requesterId: requester, clientId, reviewerId: reviewer })
    expect(d.execute).not.toHaveBeenCalled()
    expect(requiredApprovalForFamily('negative_keywords')).toMatchObject({ approvals: 1, requesterMayApprove: false, automatable: false })
  })

  it('rejects a stale request hash', async () => {
    const { d } = deps()
    await expect(createMarketingAdsReviewService(d).review(staffCtx(reviewer), { ...review(), expectedRequestHash: 'f'.repeat(64) }))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it('enforces client scope for staff reviewers and list results', async () => {
    const { d } = deps({ resolveStaff: vi.fn(async (_e, userId) => staffCtx(userId, {
      assistantScope: { departmentIds: [], clientAccessMode: 'assigned', assignedClientIds: [otherClient], catalogReleaseIds: [] }
    })) })
    const service = createMarketingAdsReviewService(d)
    await expect(service.review(staffCtx(reviewer), review())).rejects.toMatchObject({ statusCode: 403 })
    expect((await service.listPending(staffCtx(reviewer), {})).reviews).toEqual([])
    expect(d.listPendingIds).toHaveBeenCalledWith(expect.objectContaining({ clientIds: [otherClient] }))
  })

  it('lists the requester\'s own plan as not reviewable by them', async () => {
    const { d } = deps()
    const { reviews } = await createMarketingAdsReviewService(d).listPending(staffCtx(requester), {})
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ isMine: true, canReview: false, requestHash: hash })
  })

  it('lets the active owner review in God mode, but never their own request', async () => {
    const { d, setPlan } = deps()
    const service = createMarketingAdsReviewService(d)
    const beforeCommit = vi.fn()
    await expect(service.review(ownerCtx, review(), beforeCommit)).resolves.toMatchObject({ reviewerKind: 'owner', reviewedBy: owner })
    expect(beforeCommit).toHaveBeenCalledOnce()
    expect(d.requireIndependentReviewer).not.toHaveBeenCalled()
    setPlan(plan({ actorId: owner }))
    await expect(service.review(ownerCtx, review())).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses owner review when the caller is no longer an active owner', async () => {
    const { d } = deps({ isActiveOwner: vi.fn().mockResolvedValue(false) })
    await expect(createMarketingAdsReviewService(d).review(ownerCtx, review())).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('execution of approved plans', () => {
  const approved = () => plan({ status: 'approved', reviewedBy: reviewer })
  const exec = { actionPlanId: planId, expectedRequestHash: hash, ack: true }

  it('re-validates (drift + validate_only) and refuses to dispatch a stale plan', async () => {
    const { d, setPlan } = deps({ validate: vi.fn().mockResolvedValue({ valid: false, code: 'stale_plan' }) })
    setPlan(approved())
    const beforeDispatch = vi.fn()
    const result = await createMarketingAdsReviewService(d).execute(staffCtx(reviewer), exec, beforeDispatch)
    expect(result).toMatchObject({ ok: false, executed: false, code: 'stale_plan' })
    expect(beforeDispatch).not.toHaveBeenCalled()
    expect(d.execute).not.toHaveBeenCalled()
  })

  it('re-checks approver, executor and requester authority, then runs the existing executor', async () => {
    const { d, setPlan } = deps()
    setPlan(approved())
    const result = await createMarketingAdsReviewService(d).execute(staffCtx(reviewer), exec)
    expect(result).toMatchObject({ ok: true, executed: true, revalidated: true })
    expect(d.assertRequester).toHaveBeenCalled()
    expect(d.validate).toHaveBeenCalled()
    expect(d.execute).toHaveBeenCalledWith(expect.objectContaining({ id: planId }),
      expect.objectContaining({ reviewedPlanId: planId, executorId: reviewer, hasWriteScope: true }),
      { read: true, write: true, automation: false, destructive: false })
  })

  it('never lets the requester execute and refuses unapproved plans', async () => {
    const { d, setPlan } = deps()
    setPlan(approved())
    await expect(createMarketingAdsReviewService(d).execute(staffCtx(requester), exec)).rejects.toMatchObject({ statusCode: 403 })
    setPlan(plan())
    await expect(createMarketingAdsReviewService(d).execute(staffCtx(reviewer), exec)).rejects.toMatchObject({ statusCode: 409 })
    expect(d.execute).not.toHaveBeenCalled()
  })

  it('refuses when Google Ads writes are disabled', async () => {
    const { d, setPlan } = deps({ flags: vi.fn().mockResolvedValue({ read: true, write: false, automation: false, destructive: false }) })
    setPlan(approved())
    await expect(createMarketingAdsReviewService(d).execute(staffCtx(reviewer), exec)).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('dormancy', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('every service entry point refuses while the switch is off', async () => {
    const { d } = deps({ enabled: vi.fn().mockResolvedValue(false) })
    const service = createMarketingAdsReviewService(d)
    for (const call of [() => service.listPending(staffCtx(reviewer), {}), () => service.review(ownerCtx, review()),
      () => service.execute(ownerCtx, { actionPlanId: planId, expectedRequestHash: hash, ack: true })]) {
      await expect(call()).rejects.toMatchObject({ statusMessage: 'MARKETING_DRAFT_REVIEW_DISABLED' })
    }
    expect(d.loadPlan).not.toHaveBeenCalled()
  })

  it('projects no staff manifests unless marketingDraftReview is on', () => {
    expect(projectStaffAdsReviewManifests({ googleAdsRead: true, googleAdsWrite: true })).toEqual([])
    expect(projectStaffAdsReviewManifests({ googleAdsRead: true, googleAdsWrite: true, marketingDraftReview: true }).map(m => m.name))
      .toEqual(['google_ads_run_search_term_policy', 'google_ads_run_pause_policy', 'google_ads_list_pending_reviews', 'google_ads_review_plan', 'google_ads_execute_reviewed_plan'])
  })

  it('staff tool calls return disabled with the default (production) config', async () => {
    vi.stubEnv('MCP_SUITE_CONFIG', JSON.stringify({ googleAdsRead: true, googleAdsWrite: true }))
    const result = await executeStaffAdsReviewTool('google_ads_run_search_term_policy', {}, staffCtx(requester))
    expect(result).toMatchObject({ ok: false, code: 'disabled' })
  })
})

describe('owner God-mode projection', () => {
  const base = { tools: [], role: 'owner', scopes: [], requireWriteScope: true, suiteFlags: {} } as any

  it('projects only into the God-mode union', () => {
    expect(projectOwnerMarketingReviewMcpSuite(base)).toEqual([])
    expect(projectOwnerMarketingReviewMcpSuite({ ...base, governanceBypass: true }).map(m => m.name)).toEqual([
      'google_ads_list_pending_reviews', 'google_ads_review_plan', 'google_ads_execute_reviewed_plan',
      'marketing_list_budget_proposals', 'marketing_get_budget_proposal', 'marketing_review_budget_allocations'
    ])
  })

  it('classifies review decisions as explicit confirmations (permission bypass, not confirmation bypass)', () => {
    const executions = resolveOwnerMarketingReviewMcpExecutions({ ...base, governanceBypass: true })
    const byName = Object.fromEntries(executions.map(e => [e.name, e]))
    for (const name of ['google_ads_review_plan', 'google_ads_execute_reviewed_plan', 'marketing_review_budget_allocations']) {
      expect(byName[name]!.tool.mutates).toBe(true)
      expect(byName[name]!.godModeBypassedControls).toEqual(['permission'])
      expect(typeof byName[name]!.executeSupplemental).toBe('function')
    }
    expect(byName.google_ads_execute_reviewed_plan!.executionClass).toBe('external-provider')
    expect(byName.google_ads_list_pending_reviews!.tool.mutates).toBe(false)
    expect(byName.marketing_review_budget_allocations!.tool.parameters.safeParse({
      clientId, proposalId: planId, expectedRevision: hash, decision: 'approve', reason: 'Looks right', ack: false
    }).success).toBe(false)
  })
})

describe('owner budget allocation review', () => {
  const row = (extra: Record<string, unknown> = {}) => ({
    id: planId, user_id: requester, status: 'proposed', expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    resolved_payload: { clientId, revision: hash, requestKey: 'k', requestDigest: 'd', input: {}, review: null }, result_payload: null, ...extra
  }) as any
  const input = { clientId, proposalId: planId, expectedRevision: hash, decision: 'approve', reason: 'Within plan', ack: true }

  function budgetDeps(current = row()) {
    const query = vi.fn(async (sql: string) => sql.startsWith('SELECT') ? { rows: [current] } : { rows: [] })
    return {
      query,
      deps: {
        enabled: vi.fn().mockResolvedValue(true),
        isActiveOwner: vi.fn(async (id: string) => id === owner),
        assertRequester: vi.fn().mockResolvedValue(undefined),
        listRows: vi.fn().mockResolvedValue([current]),
        loadRow: vi.fn().mockResolvedValue(current),
        transaction: async (work: any) => work({ query })
      }
    }
  }

  it('records an owner approval with kind owner', async () => {
    const { deps: d, query } = budgetDeps()
    const result = await createOwnerBudgetReviewService(d).review(ownerCtx, input)
    expect(result).toMatchObject({ reviewerKind: 'owner', review: { id: owner, decision: 'approve', kind: 'owner' } })
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE ai_pending_actions'), expect.arrayContaining([planId, owner]))
  })

  it('refuses the owner reviewing their own proposal and staff contexts', async () => {
    const { deps: d } = budgetDeps(row({ user_id: owner }))
    await expect(createOwnerBudgetReviewService(d).review(ownerCtx, input)).rejects.toMatchObject({ statusCode: 403 })
    await expect(createOwnerBudgetReviewService(budgetDeps().deps).review(staffCtx(reviewer), input)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('is dormant while the switch is off', async () => {
    const { deps: d } = budgetDeps()
    d.enabled.mockResolvedValue(false)
    await expect(createOwnerBudgetReviewService(d).list(ownerCtx, {})).rejects.toMatchObject({ statusMessage: 'MARKETING_DRAFT_REVIEW_DISABLED' })
  })
})
