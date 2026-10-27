import { describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { PermissionGroup } from '~~/server/utils/permissions'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'

// The real Google Ads planner/executor and policy run below; only their storage/provider edges are
// replaced, so the authority that the MCP layer and googleAdsServer build reaches the real policy.
const googleAdsEdges = vi.hoisted(() => ({ planning: {} as Record<string, unknown>, execution: {} as Record<string, unknown> }))
vi.mock('~~/server/utils/googleAds/searchRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/googleAds/searchRuntime')>()
  return {
    ...actual,
    planSearchGoogleAdsControlAction: (input: any, authority: any, flags: any) =>
      actual.planSearchGoogleAdsControlAction(input, authority, flags, googleAdsEdges.planning as any),
    executeSearchGoogleAdsControlAction: (plan: any, authority: any, flags: any) =>
      actual.executeSearchGoogleAdsControlAction(plan, authority, flags, googleAdsEdges.execution as any)
  }
})

// Ordinary management MCP staff are authorized by their FRESH permission groups
// (resolveMcpStaffContext), never by the legacy `team_members.user_role` string. A custom role that
// narrows a broad legacy role (e.g. lead → MANAGEMENT only) must lose the CREATIVE / MEDIA_BUYING /
// FINANCE supplemental suites at discovery, invocation and confirmation. Contexts without the fresh
// marker keep role semantics for unaffected suites; ordinary Ads callers require narrow grants.
const { registry } = await import('~~/server/utils/ai/tools')
const { projectMcpToolsForStaff } = await import('~~/server/utils/ai/mcp/marketingPolicy')
const { projectRegisteredMcpTools } = await import('~~/server/utils/ai/mcp/registry')
const { generationTools, executeGenerationTool } = await import('~~/server/utils/ai/mcp/generationTools')
const { videoReadTools, executeVideoTool, executeVideoPropose, filterUsableAvProjects, avProjectActor } = await import('~~/server/utils/ai/mcp/videoTools')
const { bannerReadTools, executeBannerTool, executeBannerPropose } = await import('~~/server/utils/ai/mcp/bannerTools')
const { executeFeedReadTool, executeFeedPropose } = await import('~~/server/utils/ai/mcp/feedTools')
const { executeGoogleAdsTool, dispatchGoogleAdsConfirm, googleAdsReadTools, GOOGLE_ADS_PENDING_ACTION } = await import('~~/server/utils/ai/mcp/googleAdsTools')
const { executeGoogleAdsSearchPlanningTool, googleAdsSearchPlanningTools } = await import('~~/server/utils/ai/mcp/googleAdsSearchTools')
const { executeWriteConfirm, MCP_FINANCIAL_ACTIONS, MCP_SUPPLEMENTAL_PENDING_PERMISSIONS, MCP_WRITE_SAFE_ACTIONS, mcpPendingActionSuiteEnabled } = await import('~~/server/utils/ai/mcp/writeTools')
const { GOOGLE_ADS_PROPOSE_ACTION_TOOL } = await import('~~/server/utils/ai/mcp/googleAdsTools')
const { ADS_STAFF_READ_NAMES, ADS_STAFF_PLAN_NAMES } = await import('~~/server/utils/ai/mcp/marketingTask4Names')
const { planSearchGoogleAdsControlAction } = await import('~~/server/utils/googleAds/searchRuntime')
const { resolveGoogleAdsPolicy } = await import('~~/server/utils/googleAds/policy')
const { buildGoogleAdsConfirmDependencies } = await import('~~/server/utils/ai/mcp/googleAdsServer')
const { VIDEO_CONFIRM_ACTIONS } = await import('~~/server/utils/ai/mcp/videoTools')
const { BANNER_CONFIRM_ACTIONS } = await import('~~/server/utils/ai/mcp/bannerTools')
const { FEED_CONFIRM_ACTIONS } = await import('~~/server/utils/ai/mcp/feedTools')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROPOSAL_ID = '33333333-3333-4333-8333-333333333333'
const allFlags = {
  generation: true,
  writes: true,
  financial: true,
  video: true,
  videoGeneration: true,
  banners: true,
  feeds: true,
  googleAdsRead: true,
  googleAdsWrite: true,
  googleAdsAutomation: true,
  googleAdsDestructive: true
}

function freshCtx(groups: PermissionGroup[], userRole = 'lead'): ToolContext {
  return {
    userId: USER_ID,
    userRole,
    permissionGroups: groups,
    assistantReadOnly: false,
    mcpScopes: new Set(['mcp:read', 'mcp:write']),
    assistantScope: { departmentIds: [], clientAccessMode: 'all_active', assignedClientIds: [], catalogReleaseIds: [] },
    mcpStaffAuthority: 'fresh',
    source: 'mcp',
    event: {} as any
  }
}

function legacyCtx(userRole = 'lead'): ToolContext {
  return { userId: USER_ID, userRole, source: 'mcp', event: {} as any }
}

function staffNames(groups: PermissionGroup[], overrides: Partial<ToolContext> = {}): Set<string> {
  return new Set(projectMcpToolsForStaff({
    context: { tools: registry as any, role: 'owner', scopes: [], requireWriteScope: false, suiteFlags: allFlags },
    staff: { ...freshCtx(groups), ...overrides }
  }).map(tool => tool.name))
}

const generationNames = generationTools.map(tool => tool.name)
const videoNames = videoReadTools.map(tool => tool.name)
const bannerNames = bannerReadTools.map(tool => tool.name)
const googleAdsNames = [...googleAdsReadTools, ...googleAdsSearchPlanningTools].map(tool => tool.name)
const feedNames = ['get_inventory_feed_health', 'list_product_sets', 'propose_attach_catalog_feed']

describe('management projection uses fresh groups for every supplemental suite', () => {
  it('drops CREATIVE / MEDIA_BUYING / FINANCE suites when a narrowed custom role lacks them', () => {
    const names = staffNames(['MANAGEMENT'])
    for (const name of [...generationNames, ...videoNames, ...bannerNames, 'propose_banner_render',
      'propose_video_generation', ...googleAdsNames, ...feedNames, ...MCP_FINANCIAL_ACTIONS]) {
      expect(names.has(name), name).toBe(false)
    }
  })

  it('keeps exactly the suites the fresh groups grant', () => {
    const creative = staffNames(['MANAGEMENT', 'CREATIVE'])
    expect(bannerNames.every(name => creative.has(name))).toBe(true)
    expect(videoNames.every(name => creative.has(name))).toBe(true)
    expect(creative.has('generate_banner_image')).toBe(true)
    expect(googleAdsNames.some(name => creative.has(name))).toBe(false)
    expect(feedNames.some(name => creative.has(name))).toBe(false)

    const media = staffNames(['MANAGEMENT', 'MEDIA_BUYING'])
    expect(googleAdsNames.some(name => media.has(name))).toBe(false)
    expect(feedNames.every(name => media.has(name))).toBe(true)
    expect(bannerNames.some(name => media.has(name))).toBe(false)
  })

  it('requires the Ads capability and signed write scope even for current ADMIN management', () => {
    const groups: PermissionGroup[] = ['ADMIN', 'MANAGEMENT', 'MEDIA_BUYING']
    const granted = staffNames(groups, { marketingCapabilities: ['ads_plan'] })
    const allowed = [...ADS_STAFF_READ_NAMES, ...ADS_STAFF_PLAN_NAMES]
    expect([...granted].filter(name => name.startsWith('google_ads_')).sort()).toEqual([...allowed].sort())
    for (const name of ['google_ads_plan_remove', 'google_ads_run_pause_policy', GOOGLE_ADS_PROPOSE_ACTION_TOOL]) {
      expect(granted.has(name), name).toBe(false)
    }
    for (const overrides of [
      { marketingCapabilities: [] },
      { marketingCapabilities: ['ads_plan'], mcpScopes: new Set(['mcp:read']) },
      { marketingCapabilities: ['ads_plan'], assistantReadOnly: true }
    ] as Partial<ToolContext>[]) {
      const narrowed = staffNames(groups, overrides)
      expect(ADS_STAFF_PLAN_NAMES.some(name => narrowed.has(name))).toBe(false)
      if (!overrides.marketingCapabilities?.length) expect(ADS_STAFF_READ_NAMES.some(name => narrowed.has(name))).toBe(false)
      else expect(narrowed.has('google_ads_list_campaigns')).toBe(true)
    }
  })

  it('leaves the legacy role-based projection unchanged when no fresh groups are supplied', () => {
    const legacy = new Set(projectRegisteredMcpTools({
      tools: registry as any,
      role: 'lead',
      scopes: ['mcp:read', 'mcp:write'],
      requireWriteScope: false,
      suiteFlags: allFlags
    }).map(tool => tool.name))
    expect(bannerNames.every(name => legacy.has(name))).toBe(true)
    expect(googleAdsNames.every(name => legacy.has(name))).toBe(true)
  })
})

describe('management supplemental execution uses fresh groups', () => {
  const runner = new Proxy({}, { get: () => vi.fn(async () => ({ ran: true })) }) as any

  it('generation / video / banner reads and proposals deny a fresh context without CREATIVE', async () => {
    const ctx = freshCtx(['MANAGEMENT', 'MEDIA_BUYING'])
    const genRunner = { list_creative_models: vi.fn(async () => ({})) } as any
    await expect(executeGenerationTool('list_creative_models', {}, ctx, { enabled: true, runner: genRunner }))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(genRunner.list_creative_models).not.toHaveBeenCalled()

    const videoRunner = { list_av_projects: vi.fn(async () => []) } as any
    await expect(executeVideoTool('list_av_projects', {}, ctx, { enabled: true, runner: videoRunner }))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(videoRunner.list_av_projects).not.toHaveBeenCalled()
    await expect(executeVideoPropose('video_generation', {}, ctx, { suiteEnabled: true, genEnabled: true } as any))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })

    const bannerRunner = { list_banner_projects: vi.fn(async () => []) } as any
    await expect(executeBannerTool(bannerRunner, 'list_banner_projects', {}, ctx, true))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(bannerRunner.list_banner_projects).not.toHaveBeenCalled()
    await expect(executeBannerPropose('propose_banner_render', {}, ctx, {} as any, true))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('feed and Google Ads tools deny a fresh context without MEDIA_BUYING', async () => {
    const ctx = freshCtx(['MANAGEMENT', 'CREATIVE'])
    const feedRunner = { get_inventory_feed_health: vi.fn(async () => ({})) } as any
    await expect(executeFeedReadTool('get_inventory_feed_health', {}, ctx, { enabled: true, runner: feedRunner }))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(feedRunner.get_inventory_feed_health).not.toHaveBeenCalled()
    await expect(executeFeedPropose('propose_attach_catalog_feed', {}, ctx, { suiteEnabled: true } as any))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })

    const deps = runner
    await expect(executeGoogleAdsTool(googleAdsReadTools[0]!.name, {}, ctx, { read: true, write: true, automation: true, destructive: true }, deps))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })
    await expect(executeGoogleAdsSearchPlanningTool(googleAdsSearchPlanningTools[0]!.name, {}, ctx, { read: true, write: true, automation: true, destructive: true }, true))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })

    const loadPlan = vi.fn()
    await expect(dispatchGoogleAdsConfirm(
      { tool_name: GOOGLE_ADS_PENDING_ACTION, resolved_payload: {} },
      PROPOSAL_ID, true, ctx, { read: true, write: true, automation: true, destructive: true },
      { loadPlan, approvePlan: vi.fn(), executeConfirmed: vi.fn() }
    )).resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(loadPlan).not.toHaveBeenCalled()
  })

  it('legacy contexts retain creative permissions but cannot use Ads without a narrow grant', async () => {
    const ctx = legacyCtx('lead')
    const genRunner = { list_creative_models: vi.fn(async () => ({ models: [] })) } as any
    await expect(executeGenerationTool('list_creative_models', {}, ctx, { enabled: true, runner: genRunner }))
      .resolves.not.toMatchObject({ code: 'forbidden' })
    const bannerRunner = { list_banner_projects: vi.fn(async () => []) } as any
    await expect(executeBannerTool(bannerRunner, 'list_banner_projects', {}, ctx, true))
      .resolves.not.toMatchObject({ code: 'forbidden' })
    const provider = vi.fn()
    const adsRunner = new Proxy({}, { get: () => provider }) as any
    await expect(executeGoogleAdsTool(googleAdsReadTools[0]!.name, {}, ctx, { read: true, write: true, automation: true, destructive: true }, adsRunner))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(provider).not.toHaveBeenCalled()
  })

  it('a fresh legacy-admin narrowed to MANAGEMENT sees only their own AV projects', () => {
    const projects = [
      { id: 'mine', mediaType: 'av', createdBy: USER_ID },
      { id: 'theirs', mediaType: 'av', createdBy: 'someone-else' }
    ]
    expect(filterUsableAvProjects(projects, avProjectActor(freshCtx(['MANAGEMENT', 'CREATIVE'], 'admin'))).map(p => p.id)).toEqual(['mine'])
    expect(filterUsableAvProjects(projects, avProjectActor(freshCtx(['ADMIN', 'CREATIVE'], 'admin'))).map(p => p.id)).toEqual(['mine', 'theirs'])
    expect(filterUsableAvProjects(projects, avProjectActor(legacyCtx('admin'))).map(p => p.id)).toEqual(['mine', 'theirs'])
    expect(filterUsableAvProjects(projects, avProjectActor(legacyCtx('owner'))).map(p => p.id)).toEqual(['mine', 'theirs'])
  })
})

describe('confirm_action rechecks the pending action permission with fresh groups', () => {
  // These dispatcher stubs isolate the shared permission guard. Real Ads confirmation denial is
  // covered below; passing this outer guard does not grant provider execution or self-review.
  function confirmDeps(toolName: string, requiredPermission?: PermissionGroup) {
    const execute = vi.fn(async () => ({ resultRef: 'r1', summary: 'done' }))
    return {
      execute,
      deps: {
        enabled: true,
        writeEnabled: true,
        financialEnabled: true,
        claim: vi.fn(async () => ({ tool_name: toolName, resolved_payload: { any: true } })),
        revertClaim: vi.fn(async () => {}),
        getExecutor: vi.fn(() => ({ requiredPermission, riskTier: 'confirm', execute }) as any),
        videoDispatch: vi.fn(async (row: { tool_name: string }) => row.tool_name.startsWith('video_') ? { ok: true as const, data: { video: true } } : null),
        bannerDispatch: vi.fn(async (row: { tool_name: string }) => row.tool_name === 'banner_render' ? { ok: true as const, data: { jobIds: [] } } : null),
        feedDispatch: vi.fn(async (row: { tool_name: string }) => row.tool_name.startsWith('feed_') ? { ok: true as const, data: { feed: true } } : null),
        googleAdsDispatch: vi.fn(async (row: { tool_name: string }) => row.tool_name === GOOGLE_ADS_PENDING_ACTION ? { ok: true as const, data: { google: true } } : null)
      }
    }
  }

  const cases: Array<{ toolName: string, group: PermissionGroup, dispatcher: 'videoDispatch' | 'bannerDispatch' | 'feedDispatch' | 'googleAdsDispatch' | 'execute', requiredPermission?: PermissionGroup }> = [
    { toolName: 'banner_render', group: 'CREATIVE', dispatcher: 'bannerDispatch' },
    { toolName: 'video_generation', group: 'CREATIVE', dispatcher: 'videoDispatch' },
    { toolName: 'video_project_create', group: 'CREATIVE', dispatcher: 'videoDispatch' },
    { toolName: 'feed_attach_catalog', group: 'MEDIA_BUYING', dispatcher: 'feedDispatch' },
    { toolName: GOOGLE_ADS_PENDING_ACTION, group: 'MEDIA_BUYING', dispatcher: 'googleAdsDispatch' },
    { toolName: 'propose_budget_change', group: 'FINANCE', dispatcher: 'execute', requiredPermission: 'FINANCE' }
  ]

  for (const c of cases) {
    it(`refuses a ${c.toolName} proposal once ${c.group} is revoked, without burning it`, async () => {
      const { deps, execute } = confirmDeps(c.toolName, c.requiredPermission)
      // Still management with another suite (so confirm_action is reachable) — but not the action's group.
      const ctx = freshCtx(['MANAGEMENT', c.group === 'CREATIVE' ? 'MEDIA_BUYING' : 'CREATIVE'])
      const outcome = await executeWriteConfirm({ proposalId: PROPOSAL_ID, ack: true }, ctx, deps as any)
      expect(outcome).toMatchObject({ ok: false, code: 'forbidden' })
      const target = c.dispatcher === 'execute' ? execute : deps[c.dispatcher]
      expect(target).not.toHaveBeenCalled()
      expect(execute).not.toHaveBeenCalled()
      expect(deps.revertClaim).toHaveBeenCalledWith(PROPOSAL_ID, USER_ID)
    })

    it(`passes a ${c.toolName} proposal to its dispatcher while ${c.group} is current`, async () => {
      const { deps, execute } = confirmDeps(c.toolName, c.requiredPermission)
      const outcome = await executeWriteConfirm({ proposalId: PROPOSAL_ID, ack: true }, freshCtx(['MANAGEMENT', c.group]), deps as any)
      expect(outcome).toMatchObject({ ok: true })
      expect(c.dispatcher === 'execute' ? execute : deps[c.dispatcher]).toHaveBeenCalled()
    })
  }

  it('maps every supplemental confirm-tier pending action to its suite permission', () => {
    expect(MCP_SUPPLEMENTAL_PENDING_PERMISSIONS).toEqual({
      ...Object.fromEntries(VIDEO_CONFIRM_ACTIONS.map(name => [name, 'CREATIVE'])),
      ...Object.fromEntries(BANNER_CONFIRM_ACTIONS.map(name => [name, 'CREATIVE'])),
      ...Object.fromEntries(FEED_CONFIRM_ACTIONS.map(name => [name, 'MEDIA_BUYING'])),
      [GOOGLE_ADS_PENDING_ACTION]: 'MEDIA_BUYING'
    })
  })

  it('fresh groups (not the legacy role) govern the 2c executor permission', async () => {
    const { deps, execute } = confirmDeps('create_task', 'CLIENTS')
    const outcome = await executeWriteConfirm({ proposalId: PROPOSAL_ID }, freshCtx(['MANAGEMENT']), deps as any)
    expect(outcome).toMatchObject({ ok: false, code: 'forbidden' })
    expect(execute).not.toHaveBeenCalled()
  })

  it('keeps the owner path (no fresh marker) unchanged', async () => {
    const { deps } = confirmDeps('banner_render')
    const outcome = await executeWriteConfirm({ proposalId: PROPOSAL_ID }, { ...legacyCtx('owner'), permissionGroups: [] }, deps as any)
    expect(outcome).toMatchObject({ ok: true })
    expect(deps.bannerDispatch).toHaveBeenCalled()
  })
})

// ── Ads MCP admission and lower-level destructive policy are separate boundaries ────────────────────────────
describe('ordinary Ads MCP cannot inherit destructive authority from ADMIN or retained proposals', () => {
  const CLIENT_ID = '44444444-4444-4444-8444-444444444444'
  const CONNECTION_ID = '55555555-5555-4555-8555-555555555555'
  const PLAN_ID = '66666666-6666-4666-8666-666666666666'
  const CAMPAIGN = 'customers/1234567890/campaigns/10'
  const googleFlags = { read: true, write: true, automation: true, destructive: true }
  const session = {
    connection: { clientId: CLIENT_ID, connectionId: CONNECTION_ID, customerId: '1234567890', platform: 'google', status: 'active' },
    auth: { accessToken: 'access', developerToken: 'developer' }
  }
  const removeArgs = {
    clientId: CLIENT_ID,
    connectionId: CONNECTION_ID,
    idempotencyKey: 'remove-campaign-10',
    entityType: 'campaign',
    resourceName: CAMPAIGN,
    reason: 'Duplicate campaign retired after account review.'
  }
  // Legacy user_role stays `admin`; only the custom role decides whether ADMIN is still current.
  const narrowed = () => freshCtx(['MANAGEMENT', 'MEDIA_BUYING'], 'admin')
  const current = () => freshCtx(['ADMIN', 'MANAGEMENT', 'MEDIA_BUYING'], 'admin')

  function usePlanningEdges() {
    const persist = vi.fn(async (plan: GoogleAdsActionPlan) => plan)
    googleAdsEdges.planning = {
      resolveSession: vi.fn().mockResolvedValue(session),
      loadCurrent: vi.fn().mockResolvedValue({ resourceName: CAMPAIGN, status: 'ENABLED' }),
      loadAutomationPolicy: vi.fn().mockResolvedValue(null),
      persist,
      event: vi.fn().mockResolvedValue(undefined),
      now: () => new Date('2026-10-27T00:00:00.000Z'),
      randomUUID: () => PLAN_ID
    }
    return persist
  }

  function useExecutionEdges(plan: GoogleAdsActionPlan) {
    const mutate = vi.fn()
      .mockResolvedValueOnce({ results: [], requestId: 'validate-remove' })
      .mockResolvedValueOnce({ results: [{}], requestId: 'live-remove' })
    googleAdsEdges.execution = {
      resolveSession: vi.fn().mockResolvedValue(session),
      loadPlan: vi.fn().mockResolvedValue(plan),
      loadPlanState: vi.fn()
        .mockResolvedValueOnce(plan.currentState)
        .mockResolvedValueOnce(plan.desiredState),
      loadAutomationPolicy: vi.fn().mockResolvedValue(null),
      mutate,
      claim: vi.fn().mockResolvedValue(plan),
      event: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(plan)
    }
    return mutate
  }

  // A retained plan is built at the actual lower-level planner boundary, independent of MCP admission.
  // This models an existing approved administrative plan without granting staff the owner MCP path.
  async function retainedAdministrativePlan(): Promise<GoogleAdsActionPlan> {
    usePlanningEdges()
    const plan = await planSearchGoogleAdsControlAction({
      clientId: CLIENT_ID, connectionId: CONNECTION_ID, idempotencyKey: removeArgs.idempotencyKey,
      actorId: USER_ID, source: 'mcp', requestedMode: 'proposal', operation: 'remove_campaign',
      resourceType: 'campaign', arguments: { resourceName: CAMPAIGN, reason: removeArgs.reason }
    }, { actorRole: 'admin', hasWriteScope: true, permissionGroups: ['ADMIN', 'MANAGEMENT', 'MEDIA_BUYING'] }, googleFlags)
    expect(plan).toMatchObject({ riskTier: 'destructive_confirm', status: 'pending_approval' })
    return plan
  }

  const ordinaryContexts = [
    ['revoked ADMIN', narrowed],
    ['current ADMIN without grant', current],
    ['current ADMIN with Ads grant', () => ({ ...current(), marketingCapabilities: ['ads_plan'] } as ToolContext)],
    ['legacy admin without fresh marker', () => legacyCtx('admin')]
  ] as const

  for (const [label, context] of ordinaryContexts) {
    it(`denies new destructive MCP planning for ${label} before persistence or provider access`, async () => {
      usePlanningEdges()
      await expect(executeGoogleAdsSearchPlanningTool('google_ads_plan_remove', removeArgs, context(), googleFlags, true))
        .resolves.toMatchObject({ ok: false, code: 'forbidden' })
      for (const edge of Object.values(googleAdsEdges.planning)) {
        if (vi.isMockFunction(edge)) expect(edge).not.toHaveBeenCalled()
      }
    })

    it(`denies retained destructive proposal for ${label} before loading or validating it`, async () => {
      const plan = await retainedAdministrativePlan()
      const deps = {
        loadPlan: vi.fn(async () => plan),
        validatePlan: vi.fn(async () => ({ valid: true })),
        recordValidation: vi.fn(async () => {}),
        proposePlan: vi.fn(async () => ({ proposalId: PROPOSAL_ID }))
      } as any
      await expect(executeGoogleAdsTool(GOOGLE_ADS_PROPOSE_ACTION_TOOL, { actionPlanId: PLAN_ID }, context(), googleFlags, deps))
        .resolves.toMatchObject({ ok: false, code: 'forbidden' })
      for (const edge of Object.values(deps)) expect(edge).not.toHaveBeenCalled()
    })
  }

  it.each(['owner', 'admin'])('preserves %s destructive policy only at the actual policy boundary', (actorRole) => {
    const policy = {
      operation: 'remove_campaign' as const, actorRole, hasMediaPermission: true,
      hasElevatedPermission: true, hasWriteScope: true, globalWriteEnabled: true,
      automationEnabled: true, destructiveEnabled: true, requestedMode: 'proposal' as const,
      accountPolicy: { enabled: true }
    }
    expect(resolveGoogleAdsPolicy(policy)).toMatchObject({ allowed: true, riskTier: 'destructive_confirm' })
    expect(resolveGoogleAdsPolicy({ ...policy, hasDestructivePermission: false }))
      .toMatchObject({ allowed: false, code: 'owner_or_admin_required' })
    expect(resolveGoogleAdsPolicy({ ...policy, delegatedPlanning: true }))
      .toMatchObject({ allowed: false, code: 'independent_review_required' })
  })

  function confirmThroughRoute(plan: GoogleAdsActionPlan, ctx: ToolContext) {
    const real = buildGoogleAdsConfirmDependencies(googleFlags)
    const approvePlan = vi.fn(async (candidate: GoogleAdsActionPlan) => ({ ...candidate, status: 'approved' as const }))
    const loadPlan = vi.fn(async () => plan)
    const revertClaim = vi.fn(async () => {})
    const outcome = executeWriteConfirm({ proposalId: PROPOSAL_ID, ack: true }, ctx, {
      enabled: true,
      writeEnabled: true,
      financialEnabled: true,
      getExecutor: () => null,
      claim: vi.fn(async () => ({ tool_name: GOOGLE_ADS_PENDING_ACTION, resolved_payload: { actionPlanId: PLAN_ID } })),
      revertClaim,
      googleAdsDispatch: (row, googleContext) => dispatchGoogleAdsConfirm(row, PROPOSAL_ID, true, googleContext, googleFlags, {
        ...real,
        loadPlan,
        approvePlan
      })
    })
    return { outcome, approvePlan, loadPlan, revertClaim }
  }

  for (const [label, context] of ordinaryContexts) {
    it(`refuses retained destructive confirmation for ${label} without burning the proposal`, async () => {
      const plan = await retainedAdministrativePlan()
      useExecutionEdges({ ...plan, status: 'approved' })
      const { outcome, approvePlan, loadPlan, revertClaim } = confirmThroughRoute(plan, context())
      await expect(outcome).resolves.toMatchObject({ ok: false, code: 'forbidden' })
      expect(loadPlan).not.toHaveBeenCalled()
      expect(approvePlan).not.toHaveBeenCalled()
      for (const edge of Object.values(googleAdsEdges.execution)) expect(edge).not.toHaveBeenCalled()
      expect(revertClaim).toHaveBeenCalledWith(PROPOSAL_ID, USER_ID)
    })
  }

  it('the concrete confirm executor carries fresh groups, so an already-approved removal is blocked by policy', async () => {
    const plan = { ...(await retainedAdministrativePlan()), status: 'approved' as const }
    const mutate = useExecutionEdges(plan)
    await expect(buildGoogleAdsConfirmDependencies(googleFlags).executeConfirmed(plan, narrowed()))
      .resolves.toMatchObject({ ok: false, status: 'blocked', code: 'owner_or_admin_required' })
    expect(mutate).not.toHaveBeenCalled()
  })
})

// ── I3: a pending action is authorized against its OWN suite switches ───────────────────────────────
describe('confirm_action enforces the pending action suite switch, not just shared confirm membership', () => {
  function suiteDeps(toolName: string, suiteFlags: typeof allFlags) {
    const execute = vi.fn(async () => ({ resultRef: 'r1', summary: 'done' }))
    return {
      execute,
      deps: {
        enabled: true,
        writeEnabled: suiteFlags.writes,
        financialEnabled: suiteFlags.financial,
        suiteFlags,
        claim: vi.fn(async () => ({ tool_name: toolName, resolved_payload: { any: true } })),
        revertClaim: vi.fn(async () => {}),
        getExecutor: vi.fn(() => ({ riskTier: 'confirm', execute }) as any),
        videoDispatch: vi.fn(async (row: { tool_name: string }) => row.tool_name.startsWith('video_') ? { ok: true as const, data: {} } : null),
        bannerDispatch: vi.fn(async (row: { tool_name: string }) => row.tool_name === 'banner_render' ? { ok: true as const, data: {} } : null),
        feedDispatch: vi.fn(async (row: { tool_name: string }) => row.tool_name.startsWith('feed_') ? { ok: true as const, data: {} } : null),
        googleAdsDispatch: vi.fn(async (row: { tool_name: string }) => row.tool_name === GOOGLE_ADS_PENDING_ACTION ? { ok: true as const, data: {} } : null)
      }
    }
  }

  const cases: Array<{ toolName: string, off: Partial<typeof allFlags>, dispatcher: 'videoDispatch' | 'bannerDispatch' | 'feedDispatch' | 'googleAdsDispatch' | 'execute' }> = [
    { toolName: 'banner_render', off: { banners: false }, dispatcher: 'bannerDispatch' },
    { toolName: 'video_generation', off: { video: false }, dispatcher: 'videoDispatch' },
    { toolName: 'video_generation', off: { videoGeneration: false }, dispatcher: 'videoDispatch' },
    { toolName: 'video_project_create', off: { video: false }, dispatcher: 'videoDispatch' },
    { toolName: 'feed_attach_catalog', off: { feeds: false }, dispatcher: 'feedDispatch' },
    { toolName: GOOGLE_ADS_PENDING_ACTION, off: { googleAdsWrite: false }, dispatcher: 'googleAdsDispatch' },
    { toolName: 'propose_budget_change', off: { financial: false }, dispatcher: 'execute' },
    { toolName: 'create_task', off: { writes: false }, dispatcher: 'execute' }
  ]

  for (const c of cases) {
    it(`refuses a ${c.toolName} proposal while ${Object.keys(c.off)[0]} is off and another suite is on, without burning it`, async () => {
      const { deps, execute } = suiteDeps(c.toolName, { ...allFlags, ...c.off })
      const outcome = await executeWriteConfirm({ proposalId: PROPOSAL_ID, ack: true }, freshCtx(['ADMIN', 'MANAGEMENT', 'CREATIVE', 'MEDIA_BUYING', 'FINANCE', 'CLIENTS']), deps as any)
      expect(outcome).toMatchObject({ ok: false, code: 'disabled' })
      const target = c.dispatcher === 'execute' ? execute : deps[c.dispatcher]
      expect(target).not.toHaveBeenCalled()
      expect(deps.revertClaim).toHaveBeenCalledWith(PROPOSAL_ID, USER_ID)
    })
  }

  it('dispatches each pending action when its own suite is on', async () => {
    for (const c of cases) {
      const { deps, execute } = suiteDeps(c.toolName, allFlags)
      await expect(executeWriteConfirm({ proposalId: PROPOSAL_ID, ack: true }, freshCtx(['ADMIN', 'MANAGEMENT', 'CREATIVE', 'MEDIA_BUYING', 'FINANCE', 'CLIENTS']), deps as any))
        .resolves.toMatchObject({ ok: true })
      expect(c.dispatcher === 'execute' ? execute : deps[c.dispatcher]).toHaveBeenCalled()
    }
  })

  it('maps every known pending action to its suite switches and leaves unknown names to the dispatchers', () => {
    const off = Object.fromEntries(Object.keys(allFlags).map(key => [key, false])) as typeof allFlags
    const known = [...VIDEO_CONFIRM_ACTIONS, ...BANNER_CONFIRM_ACTIONS, ...FEED_CONFIRM_ACTIONS, GOOGLE_ADS_PENDING_ACTION, ...MCP_FINANCIAL_ACTIONS, ...MCP_WRITE_SAFE_ACTIONS]
    for (const name of known) {
      expect(mcpPendingActionSuiteEnabled(name, off), name).toBe(false)
      expect(mcpPendingActionSuiteEnabled(name, allFlags), name).toBe(true)
    }
    expect(mcpPendingActionSuiteEnabled('video_generation', { ...allFlags, video: false })).toBe(false)
    expect(mcpPendingActionSuiteEnabled('video_generation', { ...allFlags, videoGeneration: false })).toBe(false)
    expect(mcpPendingActionSuiteEnabled('unknown_action', off)).toBeNull()
  })

  it('leaves the owner confirm path (no suiteFlags supplied) unchanged', async () => {
    const { deps } = suiteDeps('banner_render', { ...allFlags, banners: false })
    const { suiteFlags: _omit, ...ownerDeps } = deps
    await expect(executeWriteConfirm({ proposalId: PROPOSAL_ID }, legacyCtx('owner'), ownerDeps as any))
      .resolves.toMatchObject({ ok: true })
    expect(deps.bannerDispatch).toHaveBeenCalled()
  })
})
