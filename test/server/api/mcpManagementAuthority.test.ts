import { beforeEach, describe, expect, it, vi } from 'vitest'

// Route-level corrections for ordinary MCP staff: the real call route, policy, staff authority,
// runtime config, projection and the REAL get_tasks handler. Only storage, the signed claim, owner
// authority and the banner runner are faked. Video confirmation runs the REAL buildVideoConfirmDeps /
// dispatchVideoConfirm / AV project gate against SQL fixtures.
const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryOneFresh: vi.fn(),
  queryRows: vi.fn(),
  execute: vi.fn(),
  consumeClaim: vi.fn(),
  isActiveAuthority: vi.fn(),
  bannerRead: vi.fn(),
  bannerConfirm: vi.fn(),
  transaction: vi.fn(),
  promote: vi.fn(),
  pending: null as null | { tool_name: string, resolved_payload: unknown },
  // `project` is the CURRENT row (fresh primitive); `cachedProject`, when set, is what the cacheable
  // route still returns for the same id (a stale Hyperdrive read).
  project: null as null | Record<string, unknown>,
  cachedProject: undefined as undefined | Record<string, unknown>,
  tasksHandler: undefined as unknown as ReturnType<typeof vi.fn>
}))

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    defineEventHandler: <T>(handler: T) => handler,
    getHeader: (event: any, name: string) => event.headers?.[name.toLowerCase()],
    readBody: async (event: any) => event.body
  }
})
vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne,
  queryRows: mocks.queryRows,
  queryOneFresh: mocks.queryOneFresh,
  queryRowsFresh: mocks.queryRows,
  queryCount: vi.fn(async () => 0),
  execute: mocks.execute,
  transaction: mocks.transaction
}))
vi.mock('~~/server/utils/ai/mcp/requestClaim', () => ({
  consumeMcpRequestClaim: mocks.consumeClaim,
  getMcpRequestGodModeAuthority: vi.fn(() => ({ active: false }))
}))
vi.mock('~~/server/utils/godMode/authority', () => ({
  isActiveGodModeAuthority: mocks.isActiveAuthority,
  isGodModeAuthorityForActor: vi.fn(() => false)
}))
vi.mock('~~/server/utils/godMode/audit', () => ({ appendGodModeAuditEvent: vi.fn() }))
vi.mock('~~/server/utils/ai/mcp/directExecution', () => ({ executeGodModeMcpCall: vi.fn() }))
vi.mock('~~/server/utils/ai/tools/remember', () => ({ executeOrdinaryMcpRememberMutation: vi.fn() }))
vi.mock('~~/server/utils/ai/mcp/bannerRunner', () => ({
  buildBannerReadRunner: () => ({ list_banner_projects: mocks.bannerRead, get_banner_render_status: mocks.bannerRead }),
  buildBannerProposeDeps: () => ({}),
  buildBannerConfirmDeps: () => ({}),
  dispatchBannerConfirm: mocks.bannerConfirm
}))
vi.mock('~~/server/utils/video-generation/promoteCreativeAsset', () => ({
  promoteCreativeAssetToVideoSource: mocks.promote
}))
vi.mock('~~/server/utils/ai/tools', async () => {
  const { tasksTool } = await vi.importActual<typeof import('~~/server/utils/ai/tools/tasks')>('~~/server/utils/ai/tools/tasks')
  const { createTaskTool } = await vi.importActual<typeof import('~~/server/utils/ai/tools/createTask')>('~~/server/utils/ai/tools/createTask')
  mocks.tasksHandler = vi.spyOn(tasksTool, 'handler') as any
  // create_task keeps the ordinary write suite's confirm_action projected when MCP_WRITE_TOOLS_ENABLED.
  return { registry: [tasksTool, createTaskTool] }
})

const { default: callHandler } = await import('../../../server/api/internal/mcp/call.post')
const { default: toolsHandler } = await import('../../../server/api/internal/mcp/tools.post')
const { resolveMcpStaffContext } = await import('~~/server/utils/ai/mcp/staffAuthority')
const { executeVideoPropose } = await import('~~/server/utils/ai/mcp/videoTools')
const { buildVideoProposeDeps } = await import('~~/server/utils/ai/mcp/videoRunner')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CUSTOM_ROLE = '22222222-2222-4222-8222-222222222222'
const CLIENT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SECRET = 'internal-service-secret'
const PROPOSAL_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const OTHER_USER = '55555555-5555-4555-8555-555555555555'

let actor: { role: string, customGroups?: string[] }
let bindings: Record<string, string>
let keySeed = 0

function call(tool: string, args: Record<string, unknown> = {}) {
  keySeed += 1
  return callHandler({
    body: { userId: USER_ID, tool, args, idempotencyKey: `mcp:${keySeed.toString(16).padStart(64, '0')}` },
    headers: { 'x-mcp-secret': SECRET, 'x-mcp-assertion': 'signed-claim' },
    context: { cloudflare: { env: bindings } },
    method: 'POST',
    path: '/api/internal/mcp/call'
  } as any) as Promise<any>
}

function sqlSeen(fragment: string): boolean {
  return [...mocks.queryOne.mock.calls, ...mocks.queryOneFresh.mock.calls, ...mocks.queryRows.mock.calls, ...mocks.execute.mock.calls]
    .some(([sql]) => typeof sql === 'string' && sql.includes(fragment))
}

describe('ordinary MCP management authority corrections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('MCP_INTERNAL_SECRET', SECRET)
    bindings = { MCP_SERVER_ENABLED: 'true' }
    actor = { role: 'lead', customGroups: ['MANAGEMENT'] }
    mocks.isActiveAuthority.mockReturnValue(false)
    mocks.consumeClaim.mockImplementation(async () => ({ uid: USER_ID, scope: ['mcp:read', 'mcp:write'], bodyDigest: 'e'.repeat(64) }))
    mocks.execute.mockResolvedValue(1)
    mocks.bannerRead.mockResolvedValue([])
    mocks.bannerConfirm.mockResolvedValue({ ok: true, data: { jobIds: ['render-1'] } })
    mocks.transaction.mockReset()
    mocks.pending = null
    mocks.project = null
    mocks.cachedProject = undefined
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM team_members')) {
        return { role: actor.role, custom_role_id: actor.customGroups ? CUSTOM_ROLE : null, name: 'Staff', email: 'staff@example.test' }
      }
      if (sql.includes('FROM custom_roles')) {
        return sql.includes('cr.id = $1') && actor.customGroups
          ? { is_read_only: false, permission_groups: actor.customGroups }
          : null
      }
      if (sql.includes('ai_action_audit')) return { n: 0 }
      if (sql.includes('UPDATE ai_pending_actions SET status=\'executed\'')) return mocks.pending
      if (sql.includes('INSERT INTO ai_pending_actions')) return { id: PROPOSAL_ID }
      if (sql.includes('FROM media_projects')) return mocks.cachedProject ?? mocks.project
      return null
    })
    // The uncached primitive sees the current project row; everything else matches the cached route.
    mocks.queryOneFresh.mockImplementation(async (sql: string, params?: unknown[]) => (
      sql.includes('FROM media_projects') ? mocks.project : mocks.queryOne(sql, params)
    ))
    mocks.queryRows.mockImplementation(async (sql: string) => (
      sql.includes('client_team_assignments') ? [{ client_id: CLIENT_A }] : []
    ))
  })

  it('denies a supplemental banner read for management narrowed away from CREATIVE', async () => {
    bindings.MCP_BANNER_TOOLS_ENABLED = 'true'
    await expect(call('list_banner_projects')).resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(mocks.bannerRead).not.toHaveBeenCalled()

    actor.customGroups = ['MANAGEMENT', 'CREATIVE']
    await expect(call('list_banner_projects')).resolves.toMatchObject({ ok: true })
    expect(mocks.bannerRead).toHaveBeenCalledTimes(1)
  })

  it('refuses confirm_action before claiming when the fresh projection does not list it', async () => {
    // Banner flag on, but the fresh groups grant no suite that emits confirm_action.
    bindings.MCP_BANNER_TOOLS_ENABLED = 'true'
    await expect(call('confirm_action', { proposalId: '33333333-3333-4333-8333-333333333333' }))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(sqlSeen('UPDATE ai_pending_actions')).toBe(false)

    actor.customGroups = ['MANAGEMENT', 'CREATIVE']
    await call('confirm_action', { proposalId: '33333333-3333-4333-8333-333333333333' })
    expect(sqlSeen('UPDATE ai_pending_actions')).toBe(true)
  })

  function reverted(): boolean {
    return mocks.execute.mock.calls.some(([sql]) => typeof sql === 'string' && sql.includes('SET status=\'proposed\''))
  }

  it('refuses a banner proposal while the banner suite is off even though another suite projects confirm_action', async () => {
    // CREATIVE is current and the ordinary write suite keeps confirm_action in the projection.
    actor.customGroups = ['MANAGEMENT', 'CREATIVE']
    bindings.MCP_WRITE_TOOLS_ENABLED = 'true'
    bindings.MCP_BANNER_TOOLS_ENABLED = 'false'
    mocks.pending = { tool_name: 'banner_render', resolved_payload: { projectId: PROJECT_ID } }
    await expect(call('confirm_action', { proposalId: PROPOSAL_ID }))
      .resolves.toMatchObject({ ok: false, code: 'disabled' })
    expect(sqlSeen('UPDATE ai_pending_actions SET status=\'executed\'')).toBe(true)
    expect(mocks.bannerConfirm).not.toHaveBeenCalled()
    expect(reverted()).toBe(true)

    vi.clearAllMocks()
    mocks.bannerConfirm.mockResolvedValue({ ok: true, data: { jobIds: ['render-1'] } })
    bindings.MCP_BANNER_TOOLS_ENABLED = 'true'
    await expect(call('confirm_action', { proposalId: PROPOSAL_ID })).resolves.toMatchObject({ ok: true })
    expect(mocks.bannerConfirm).toHaveBeenCalledTimes(1)
  })

  const videoPayload = {
    tenantId: CLIENT_A,
    projectId: PROJECT_ID,
    timelineId: null,
    mode: 'text-to-video',
    modelId: 'm1',
    provider: 'cf',
    prompt: 'a calm city street at dawn',
    sourceAssetIds: [],
    durationSeconds: 5,
    aspectRatio: '16:9',
    resolution: null,
    subjectType: 'unknown',
    complianceStatus: 'clear',
    complianceReasons: [],
    estimatedCostCents: 250
  }

  it('refuses a video proposal while the video suite is off even though video generation and writes stay on', async () => {
    actor = { role: 'admin', customGroups: ['ADMIN', 'MANAGEMENT', 'CREATIVE'] }
    bindings.MCP_WRITE_TOOLS_ENABLED = 'true'
    bindings.MCP_VIDEO_GEN_ENABLED = 'true'
    bindings.MCP_VIDEO_TOOLS_ENABLED = 'false'
    mocks.project = { id: PROJECT_ID, media_type: 'av', created_by: OTHER_USER, client_id: CLIENT_A }
    mocks.pending = { tool_name: 'video_generation', resolved_payload: videoPayload }
    await expect(call('confirm_action', { proposalId: PROPOSAL_ID }))
      .resolves.toMatchObject({ ok: false, code: 'disabled' })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(sqlSeen('FROM media_projects')).toBe(false)
    expect(reverted()).toBe(true)
  })

  async function proposeVideoAsCurrentUser() {
    const event = { context: { cloudflare: { env: bindings } } } as any
    const ctx = await resolveMcpStaffContext(event, USER_ID, ['mcp:read', 'mcp:write'])
    const proposed = await executeVideoPropose('video_generation', {
      projectId: PROJECT_ID, mode: 'text-to-video', modelId: 'm1', prompt: 'a calm city street at dawn',
      durationSeconds: 5, aspectRatio: '16:9', subjectType: 'unknown'
    }, ctx, {
      ...buildVideoProposeDeps(),
      suiteEnabled: true,
      genEnabled: true,
      // The REAL authorizedProject gate and proposeAction persistence; only the model catalog,
      // compliance and costing are stubbed.
      getModel: () => ({ id: 'm1', provider: 'cf', modes: ['text-to-video'], durationsSeconds: [5], aspectRatios: ['16:9'], resolutions: [], allowedSubjectTypes: ['unknown'], requiresApprovedSourceAsset: false }),
      isTenantModel: () => true,
      loadSources: async () => [],
      loadPolicy: async () => ({ enabled: true, monthlyCapCents: 100000 }),
      evaluateCompliance: () => ({ allowed: true, classification: 'clear', reasons: [] }),
      estimateCost: () => 250
    } as any)
    const insert = mocks.queryOne.mock.calls.find(([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO ai_pending_actions'))
    return { proposed, persisted: insert ? JSON.parse(insert[1][3]) : undefined }
  }

  it('re-authorizes the retained AV project at confirmation after ADMIN is revoked (propose → revoke → confirm)', async () => {
    actor = { role: 'admin', customGroups: ['ADMIN', 'MANAGEMENT', 'CREATIVE'] }
    bindings.MCP_VIDEO_TOOLS_ENABLED = 'true'
    bindings.MCP_VIDEO_GEN_ENABLED = 'true'
    // Another user's AV project: usable only while the legacy admin still holds ADMIN.
    mocks.project = { id: PROJECT_ID, media_type: 'av', created_by: OTHER_USER, client_id: CLIENT_A }

    const { proposed, persisted } = await proposeVideoAsCurrentUser()
    expect(proposed).toMatchObject({ ok: true, data: { proposalId: PROPOSAL_ID } })
    expect(persisted).toMatchObject({ projectId: PROJECT_ID, tenantId: CLIENT_A })

    // Revoke ADMIN: still active, writable, CREATIVE, signed mcp:write, suites on.
    actor.customGroups = ['MANAGEMENT', 'CREATIVE']
    vi.clearAllMocks()
    mocks.pending = { tool_name: 'video_generation', resolved_payload: persisted }
    await expect(call('confirm_action', { proposalId: PROPOSAL_ID }))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(sqlSeen('FROM media_projects')).toBe(true)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(sqlSeen('video_generation_jobs')).toBe(false)
    expect(reverted()).toBe(true)
  })

  it('refuses a retained video proposal whose project moved to another client', async () => {
    actor = { role: 'admin', customGroups: ['ADMIN', 'MANAGEMENT', 'CREATIVE'] }
    bindings.MCP_VIDEO_TOOLS_ENABLED = 'true'
    bindings.MCP_VIDEO_GEN_ENABLED = 'true'
    mocks.project = { id: PROJECT_ID, media_type: 'av', created_by: OTHER_USER, client_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }
    mocks.pending = { tool_name: 'video_generation', resolved_payload: videoPayload }
    await expect(call('confirm_action', { proposalId: PROPOSAL_ID }))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(reverted()).toBe(true)
  })

  it('refuses a retained proposal when only the cached route still returns the project under its old client', async () => {
    actor = { role: 'admin', customGroups: ['ADMIN', 'MANAGEMENT', 'CREATIVE'] }
    bindings.MCP_VIDEO_TOOLS_ENABLED = 'true'
    bindings.MCP_VIDEO_GEN_ENABLED = 'true'
    const CLIENT_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    // Stale cache: P→A (matches the retained tenant). Current row: P→B.
    mocks.cachedProject = { id: PROJECT_ID, media_type: 'av', created_by: OTHER_USER, client_id: CLIENT_A }
    mocks.project = { id: PROJECT_ID, media_type: 'av', created_by: OTHER_USER, client_id: CLIENT_B }

    mocks.pending = { tool_name: 'video_generation', resolved_payload: videoPayload }
    await expect(call('confirm_action', { proposalId: PROPOSAL_ID }))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(mocks.queryOneFresh.mock.calls.some(([sql]) => String(sql).includes('FROM media_projects'))).toBe(true)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(sqlSeen('video_generation_jobs')).toBe(false)
    expect(reverted()).toBe(true)

    vi.clearAllMocks()
    mocks.pending = {
      tool_name: 'video_source_promote',
      resolved_payload: {
        assetId: 'asset-1', projectId: PROJECT_ID, tenantId: CLIENT_A, subjectType: 'unknown',
        expectedSourceSystem: 'banner_studio', expectedSourceAssetRef: 'asset-1'
      }
    }
    await expect(call('confirm_action', { proposalId: PROPOSAL_ID }))
      .resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(mocks.promote).not.toHaveBeenCalled()
    expect(reverted()).toBe(true)
  })

  it('reaches the reservation when the current row matches even though the cached route is stale', async () => {
    actor = { role: 'admin', customGroups: ['ADMIN', 'MANAGEMENT', 'CREATIVE'] }
    bindings.MCP_VIDEO_TOOLS_ENABLED = 'true'
    bindings.MCP_VIDEO_GEN_ENABLED = 'true'
    mocks.cachedProject = { id: PROJECT_ID, media_type: 'av', created_by: OTHER_USER, client_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }
    mocks.project = { id: PROJECT_ID, media_type: 'av', created_by: OTHER_USER, client_id: CLIENT_A }
    mocks.pending = { tool_name: 'video_generation', resolved_payload: videoPayload }
    mocks.transaction.mockResolvedValue({ ok: false, reason: 'cap' })
    await expect(call('confirm_action', { proposalId: PROPOSAL_ID }))
      .resolves.toMatchObject({ ok: false, code: 'cap_exceeded' })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })

  it('reaches the budget reservation for the same retained proposal while ADMIN is current', async () => {
    actor = { role: 'admin', customGroups: ['ADMIN', 'MANAGEMENT', 'CREATIVE'] }
    bindings.MCP_VIDEO_TOOLS_ENABLED = 'true'
    bindings.MCP_VIDEO_GEN_ENABLED = 'true'
    mocks.project = { id: PROJECT_ID, media_type: 'av', created_by: OTHER_USER, client_id: CLIENT_A }
    mocks.pending = { tool_name: 'video_generation', resolved_payload: videoPayload }
    mocks.transaction.mockResolvedValue({ ok: false, reason: 'cap' })
    await expect(call('confirm_action', { proposalId: PROPOSAL_ID }))
      .resolves.toMatchObject({ ok: false, code: 'cap_exceeded' })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
  })

  it('never reaches the real get_tasks handler for a broad legacy role narrowed by a custom role', async () => {
    // Legacy `lead` would widen get_tasks to agency-wide; the custom role grants only CREATIVE.
    actor = { role: 'lead', customGroups: ['CREATIVE'] }
    await expect(call('get_tasks')).resolves.toMatchObject({ ok: false, code: 'role_policy_mismatch' })
    expect(mocks.tasksHandler).not.toHaveBeenCalled()
    expect(sqlSeen('FROM tasks')).toBe(false)
  })

  it('reaches the real get_tasks handler for a matching non-management system role', async () => {
    actor = { role: 'creative' }
    await call('get_tasks')
    expect(mocks.tasksHandler).toHaveBeenCalledTimes(1)
    expect(mocks.tasksHandler.mock.calls[0]![1]).toMatchObject({ userId: USER_ID, userRole: 'creative', mcpStaffAuthority: 'fresh' })
  })
})

describe('internal MCP ingress secret is binding-first', () => {
  function ingress(handler: (event: any) => Promise<unknown>, env: Record<string, unknown>, secret = SECRET) {
    return handler({
      body: { userId: USER_ID, tool: 'get_tasks', args: {}, idempotencyKey: `mcp:${'a'.repeat(64)}` },
      headers: { 'x-mcp-secret': secret, 'x-mcp-assertion': 'signed-claim' },
      context: { cloudflare: { env: { MCP_SERVER_ENABLED: 'true', ...env } } },
      method: 'POST',
      path: '/api/internal/mcp'
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv('MCP_INTERNAL_SECRET', '')
    delete process.env.MCP_INTERNAL_SECRET
    // Stop right after ingress: the claim consumer is the first step past the secret check.
    mocks.consumeClaim.mockRejectedValue(Object.assign(new Error('claim reached'), { statusCode: 418 }))
  })

  for (const [name, handler] of [['tools/list', () => toolsHandler], ['tools/call', () => callHandler]] as const) {
    it(`${name} accepts a binding-only secret with no process secret`, async () => {
      await expect(ingress(handler() as any, { MCP_INTERNAL_SECRET: SECRET })).rejects.toMatchObject({ statusCode: 418 })
    })

    it(`${name} rejects when the binding conflicts with the process secret`, async () => {
      vi.stubEnv('MCP_INTERNAL_SECRET', SECRET)
      await expect(ingress(handler() as any, { MCP_INTERNAL_SECRET: 'other-binding-secret' })).rejects.toMatchObject({ statusCode: 401 })
      expect(mocks.consumeClaim).not.toHaveBeenCalled()
    })

    it(`${name} fails closed on a present non-string binding even if the process secret matches`, async () => {
      vi.stubEnv('MCP_INTERNAL_SECRET', SECRET)
      await expect(ingress(handler() as any, { MCP_INTERNAL_SECRET: { secret: SECRET } })).rejects.toMatchObject({ statusCode: 401 })
      expect(mocks.consumeClaim).not.toHaveBeenCalled()
    })

    it(`${name} rejects when no secret is configured anywhere`, async () => {
      await expect(ingress(handler() as any, {}, '')).rejects.toMatchObject({ statusCode: 401 })
    })
  }
})
