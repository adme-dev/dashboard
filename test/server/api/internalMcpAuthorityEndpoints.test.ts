import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyAssertion: vi.fn(),
  resolveAuthority: vi.fn(),
  consumeClaim: vi.fn(),
  getAuthority: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  projectReadOnly: vi.fn(),
  projectGeneration: vi.fn(),
  projectWrite: vi.fn(),
  projectVideo: vi.fn(),
  projectBanner: vi.fn(),
  projectFinancial: vi.fn(),
  projectOwnerCatalog: vi.fn(),
  projectRegistered: vi.fn(),
  projectGodMode: vi.fn(),
  executeReadOnly: vi.fn(),
  executeWriteConfirm: vi.fn(),
  executeGodModeMcpCall: vi.fn(),
  isActiveAuthority: vi.fn(),
  appendAudit: vi.fn()
  ,executeRemember: vi.fn()
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

vi.mock('~~/server/utils/ai/mcp/assertion', () => ({
  verifyMcpAssertion: mocks.verifyAssertion
}))
vi.mock('~~/server/utils/godMode/authority', () => ({
  resolveGodModeAuthority: mocks.resolveAuthority,
  isActiveGodModeAuthority: mocks.isActiveAuthority
}))
vi.mock('~~/server/utils/godMode/audit', () => ({
  appendGodModeAuditEvent: mocks.appendAudit
}))
vi.mock('~~/server/utils/ai/mcp/requestClaim', () => ({
  consumeMcpRequestClaim: mocks.consumeClaim,
  getMcpRequestGodModeAuthority: mocks.getAuthority
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.queryOne,
  execute: mocks.execute,
  queryRows: vi.fn(async () => [])
}))
vi.mock('~~/server/utils/ai/tools', () => ({ registry: [] }))
vi.mock('~~/server/utils/ai/tools/remember', () => ({
  executeOrdinaryMcpRememberMutation: mocks.executeRemember
}))
vi.mock('~~/server/utils/ai/mcp/project', () => ({
  projectReadOnlyTools: mocks.projectReadOnly,
  projectGodModeCatalogTools: mocks.projectOwnerCatalog,
  executeReadOnlyTool: mocks.executeReadOnly,
  toMcpInputSchema: (schema: { toJSONSchema?: unknown }) => ({ type: 'object', ...(schema as object) })
}))
vi.mock('~~/server/utils/ai/mcp/registry', () => ({
  projectRegisteredMcpTools: mocks.projectRegistered,
  projectGodModeTools: mocks.projectGodMode
}))
vi.mock('~~/server/utils/ai/mcp/directExecution', () => ({
  executeGodModeMcpCall: mocks.executeGodModeMcpCall
}))
vi.mock('~~/server/utils/ai/mcp/generationTools', () => ({
  generationTools: [],
  projectGenerationTools: mocks.projectGeneration,
  executeGenerationTool: vi.fn()
}))
vi.mock('~~/server/utils/ai/mcp/generationRunner', () => ({ buildGenerationRunner: vi.fn() }))
vi.mock('~~/server/utils/ai/mcp/videoTools', () => ({
  videoReadTools: [],
  projectVideoTools: mocks.projectVideo,
  executeVideoTool: vi.fn(),
  executeVideoPropose: vi.fn(),
  resolveVideoProposeAction: vi.fn(() => null),
  dispatchVideoConfirm: vi.fn()
}))
vi.mock('~~/server/utils/ai/mcp/videoRunner', () => ({
  buildVideoReadRunner: vi.fn(),
  buildVideoProposeDeps: vi.fn(),
  buildVideoConfirmDeps: vi.fn(() => ({}))
}))
vi.mock('~~/server/utils/ai/mcp/bannerTools', () => ({
  bannerReadTools: [],
  projectBannerTools: mocks.projectBanner,
  executeBannerTool: vi.fn(),
  executeBannerPropose: vi.fn(),
  resolveBannerProposeAction: vi.fn(() => null)
}))
vi.mock('~~/server/utils/ai/mcp/bannerRunner', () => ({
  buildBannerReadRunner: vi.fn(),
  buildBannerProposeDeps: vi.fn(),
  buildBannerConfirmDeps: vi.fn(),
  dispatchBannerConfirm: vi.fn()
}))
vi.mock('~~/server/utils/ai/mcp/rateLimit', () => ({
  isGenerationRateLimited: vi.fn(() => false),
  MCP_GEN_RATE_WINDOW_MIN: 10
}))
vi.mock('~~/server/utils/ai/mcp/writeTools', () => ({
  projectWriteTools: mocks.projectWrite,
  projectFinancialTools: mocks.projectFinancial,
  resolveProposeAction: vi.fn((name: string) => name === 'propose_create_task' ? 'create_task' : null),
  executeWriteConfirm: mocks.executeWriteConfirm,
  MCP_CONFIRM_TOOL: 'confirm_action',
  isFinancialAction: vi.fn(() => false),
  MCP_FINANCIAL_ACTIONS: [],
  MCP_FINANCIAL_RICH_CONFIRM: []
}))
vi.mock('~~/server/utils/ai/executors', () => ({ getExecutor: vi.fn() }))
vi.mock('~~/server/utils/ai/toolRegistry', () => ({ filterToolsForUser: vi.fn(() => []) }))

const { default: exchangeHandler } = await import('../../../../server/api/internal/mcp/exchange.post')
const { default: toolsHandler } = await import('../../../../server/api/internal/mcp/tools.post')
const { default: callHandler } = await import('../../../../server/api/internal/mcp/call.post')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const INTERNAL_SECRET = 'internal-service-secret'
const CLAIM = 'signed-request-claim-redacted'

function event(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return { body, headers, context: {}, method: 'POST', path: '/api/internal/mcp/tools' } as any
}

describe('internal MCP exchange authority', () => {
  afterEach(() => vi.unstubAllEnvs())

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('MCP_SERVER_ENABLED', 'true')
    vi.stubEnv('MCP_INTERNAL_SECRET', INTERNAL_SECRET)
    vi.stubEnv('MCP_HANDSHAKE_SECRET', 'handshake-secret')
    mocks.verifyAssertion.mockResolvedValue({ uid: USER_ID, scope: ['mcp:read'] })
    mocks.resolveAuthority.mockResolvedValue({ active: true, actorUserId: USER_ID })
  })

  it('resolves the OAuth assertion subject freshly and returns only that server-derived owner bit', async () => {
    const requestEvent = event(
      { assertion: 'oauth-assertion', godMode: false },
      { 'x-mcp-secret': INTERNAL_SECRET }
    )

    await expect(exchangeHandler(requestEvent)).resolves.toEqual({
      userId: USER_ID,
      scope: ['mcp:read'],
      godMode: true
    })
    expect(mocks.resolveAuthority).toHaveBeenCalledWith(requestEvent, USER_ID)
  })
})

describe('signed internal MCP list/call endpoints', () => {
  afterEach(() => vi.unstubAllEnvs())

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('MCP_SERVER_ENABLED', 'true')
    vi.stubEnv('MCP_INTERNAL_SECRET', INTERNAL_SECRET)
    vi.stubEnv('MCP_REQUIRE_WRITE_SCOPE', 'true')
    vi.stubEnv('MCP_WRITE_TOOLS_ENABLED', 'true')
    mocks.consumeClaim.mockResolvedValue({
      uid: USER_ID,
      scope: ['mcp:read'],
      godMode: false
    })
    mocks.queryOne.mockResolvedValue({ role: 'member' })
    mocks.execute.mockResolvedValue(1)
    mocks.projectReadOnly.mockReturnValue([{ name: 'get_tasks', description: 'read', inputSchema: {} }])
    mocks.projectGeneration.mockReturnValue([])
    mocks.projectWrite.mockReturnValue([{ name: 'propose_create_task', description: 'write', inputSchema: {} }])
    mocks.projectVideo.mockReturnValue([])
    mocks.projectBanner.mockReturnValue([])
    mocks.projectFinancial.mockReturnValue([])
    mocks.executeReadOnly.mockResolvedValue({ ok: true, data: { count: 1 } })
    mocks.getAuthority.mockReturnValue({ active: false, actorUserId: USER_ID })
    mocks.isActiveAuthority.mockReturnValue(false)
    mocks.projectOwnerCatalog.mockReturnValue([
      { name: 'get_tasks', description: 'owner read', inputSchema: {} },
      { name: 'create_task', description: 'owner write', inputSchema: {} }
    ])
    mocks.projectGodMode.mockReturnValue([
      { name: 'get_tasks', description: 'owner read', inputSchema: {} },
      { name: 'create_task', description: 'owner write', inputSchema: {} }
    ])
    mocks.projectRegistered.mockReturnValue([
      { name: 'get_tasks', description: 'read', inputSchema: {} }
    ])
    mocks.executeGodModeMcpCall.mockResolvedValue({ ok: true, data: { resultRef: 'task-1', directExecution: true } })
    mocks.executeWriteConfirm.mockResolvedValue({ ok: true, data: { resultRef: 'task-ordinary' } })
    mocks.appendAudit.mockResolvedValue(undefined)
    mocks.executeRemember.mockResolvedValue({ ok: true, data: { remembered: true, id: 'memory-1' } })
  })

  it('requires the signed claim in addition to the service secret before list projection', async () => {
    const requestEvent = event(
      { userId: USER_ID },
      {
        'x-mcp-secret': INTERNAL_SECRET,
        'x-mcp-assertion': CLAIM,
        'x-mcp-scope': 'mcp:read mcp:write'
      }
    )
    const ordering: string[] = []
    mocks.consumeClaim.mockImplementation(async () => {
      ordering.push('claim-consumed')
      return { uid: USER_ID, scope: ['mcp:read'], godMode: false }
    })
    mocks.queryOne.mockImplementation(async () => {
      ordering.push('projected')
      return { role: 'member' }
    })

    await expect(toolsHandler(requestEvent)).resolves.toEqual({
      tools: [{ name: 'get_tasks', description: 'read', inputSchema: {} }],
      catalog: {
        release: '2026-09-03.1',
        previousRelease: '2026-09-01.15',
        toolCount: 1,
        source: 'fresh_server_projection',
        fullOwnerProjection: false,
      },
    })
    expect(mocks.consumeClaim).toHaveBeenCalledWith(requestEvent, CLAIM, USER_ID)
    expect(ordering).toEqual(['claim-consumed', 'projected'])
    expect(String(mocks.queryOne.mock.calls[0]?.[0])).toContain('SELECT user_role AS role')
  })

  it('uses only signed scopes so an unsigned header cannot grant call write scope', async () => {
    const requestEvent = event(
      {
        userId: USER_ID,
        tool: 'propose_create_task',
        args: { title: 'Do the thing' },
        idempotencyKey: `mcp:${'a'.repeat(64)}`
      },
      {
        'x-mcp-secret': INTERNAL_SECRET,
        'x-mcp-assertion': CLAIM,
        'x-mcp-scope': 'mcp:read mcp:write'
      }
    )
    requestEvent.path = '/api/internal/mcp/call'

    await expect(callHandler(requestEvent)).resolves.toMatchObject({
      ok: false,
      code: 'insufficient_scope'
    })
    expect(mocks.consumeClaim).toHaveBeenCalledWith(requestEvent, CLAIM, USER_ID)
    expect(String(mocks.queryOne.mock.calls[0]?.[0])).toContain('SELECT user_role AS role')
  })

  it('blocks ordinary remember calls when the signed claim has read scope only', async () => {
    const requestEvent = event(
      {
        userId: USER_ID,
        tool: 'remember',
        args: { content: 'Reports are in AUD' },
        idempotencyKey: `mcp:${'b'.repeat(64)}`
      },
      {
        'x-mcp-secret': INTERNAL_SECRET,
        'x-mcp-assertion': CLAIM,
        'x-mcp-scope': 'mcp:read mcp:write'
      }
    )
    requestEvent.path = '/api/internal/mcp/call'

    await expect(callHandler(requestEvent)).resolves.toMatchObject({
      ok: false,
      code: 'insufficient_scope'
    })
    expect(mocks.executeReadOnly).not.toHaveBeenCalled()
    expect(mocks.executeRemember).not.toHaveBeenCalled()
  })

  it('routes an ordinary write-scoped remember call through its durable local coordinator', async () => {
    mocks.consumeClaim.mockResolvedValue({ uid: USER_ID, scope: ['mcp:read', 'mcp:write'], bodyDigest: 'e'.repeat(64) })
    const requestEvent = event({
      userId: USER_ID,
      tool: 'remember',
      args: { content: 'Reports are in AUD' },
      idempotencyKey: `mcp:${'d'.repeat(64)}`
    }, { 'x-mcp-secret': INTERNAL_SECRET, 'x-mcp-assertion': CLAIM })
    requestEvent.path = '/api/internal/mcp/call'

    await expect(callHandler(requestEvent)).resolves.toMatchObject({ ok: true, data: { remembered: true } })
    expect(mocks.executeRemember).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      idempotencyKey: `mcp:${'d'.repeat(64)}`,
      sessionDigest: 'e'.repeat(64),
      args: { content: 'Reports are in AUD' }
    }))
    expect(mocks.executeReadOnly).not.toHaveBeenCalled()
  })

  it('projects the complete registered owner catalog from the consumed fresh authority, not role or suite flags', async () => {
    mocks.consumeClaim.mockResolvedValue({
      uid: USER_ID,
      scope: ['mcp:read'],
      godMode: false,
      bodyDigest: 'a'.repeat(64)
    })
    const authority = { active: true, actorUserId: USER_ID }
    mocks.getAuthority.mockReturnValue(authority)
    mocks.isActiveAuthority.mockImplementation((candidate, actor) => candidate === authority && actor === USER_ID)
    vi.stubEnv('MCP_WRITE_TOOLS_ENABLED', 'false')
    const ordering: string[] = []
    mocks.appendAudit.mockImplementation(async audit => { ordering.push(`audit:${audit.phase}`) })
    mocks.projectGodMode.mockImplementation(() => {
      ordering.push('project')
      return [
        { name: 'get_tasks', description: 'owner read', inputSchema: {} },
        { name: 'create_task', description: 'owner write', inputSchema: {} }
      ]
    })

    const requestEvent = event(
      { userId: USER_ID },
      { 'x-mcp-secret': INTERNAL_SECRET, 'x-mcp-assertion': CLAIM }
    )

    await expect(toolsHandler(requestEvent)).resolves.toEqual({
      tools: [
        { name: 'get_tasks', description: 'owner read', inputSchema: {} },
        { name: 'create_task', description: 'owner write', inputSchema: {} }
      ],
      catalog: {
        release: '2026-09-03.1',
        previousRelease: '2026-09-01.15',
        toolCount: 2,
        source: 'fresh_server_projection',
        fullOwnerProjection: true,
      },
    })
    expect(mocks.getAuthority).toHaveBeenCalledWith(requestEvent, USER_ID)
    expect(mocks.projectGodMode).toHaveBeenCalledWith(expect.objectContaining({
      role: 'owner',
      scopes: ['mcp:read'],
      requireWriteScope: true,
      suiteFlags: expect.objectContaining({ writes: false })
    }))
    expect(mocks.projectRegistered).not.toHaveBeenCalled()
    expect(mocks.appendAudit.mock.calls.map(([audit]) => audit.phase)).toEqual(['attempt', 'succeeded'])
    expect(ordering).toEqual(['audit:attempt', 'project', 'audit:succeeded'])
    expect(mocks.appendAudit.mock.calls[0]?.[0].bypassedControls).toEqual(expect.arrayContaining([
      'mcp_scope',
      'mcp_suite_flag'
    ]))
  })

  it('blocks an owner manifest and records a failed terminal when projection fails after its attempt', async () => {
    mocks.consumeClaim.mockResolvedValue({
      uid: USER_ID,
      scope: ['mcp:read', 'mcp:write'],
      godMode: true,
      bodyDigest: 'a'.repeat(64)
    })
    const authority = { active: true, actorUserId: USER_ID }
    mocks.getAuthority.mockReturnValue(authority)
    mocks.isActiveAuthority.mockImplementation((candidate, actor) => candidate === authority && actor === USER_ID)
    mocks.projectGodMode.mockImplementation(() => { throw new Error('schema content must not leak') })

    await expect(toolsHandler(event(
      { userId: USER_ID },
      { 'x-mcp-secret': INTERNAL_SECRET, 'x-mcp-assertion': CLAIM }
    ))).rejects.toMatchObject({ statusCode: 503, statusMessage: 'God mode MCP audit unavailable' })

    expect(mocks.appendAudit.mock.calls.map(([audit]) => [audit.phase, audit.outcomeCode])).toEqual([
      ['attempt', 'started'],
      ['failed', 'catalog_projection_failed']
    ])
  })

  it('does not project an owner manifest when its immutable attempt insert fails', async () => {
    mocks.consumeClaim.mockResolvedValue({
      uid: USER_ID,
      scope: ['mcp:read'],
      godMode: true,
      bodyDigest: 'a'.repeat(64)
    })
    const authority = { active: true, actorUserId: USER_ID }
    mocks.getAuthority.mockReturnValue(authority)
    mocks.isActiveAuthority.mockImplementation((candidate, actor) => candidate === authority && actor === USER_ID)
    mocks.appendAudit.mockRejectedValueOnce(new Error('attempt insert unavailable'))

    await expect(toolsHandler(event(
      { userId: USER_ID },
      { 'x-mcp-secret': INTERNAL_SECRET, 'x-mcp-assertion': CLAIM }
    ))).rejects.toMatchObject({ statusCode: 503, statusMessage: 'God mode MCP audit unavailable' })

    expect(mocks.appendAudit).toHaveBeenCalledTimes(1)
    expect(mocks.appendAudit).toHaveBeenCalledWith(expect.objectContaining({ phase: 'attempt', outcomeCode: 'started' }))
    expect(mocks.projectGodMode).not.toHaveBeenCalled()
  })

  it('blocks an owner manifest when the terminal discovery audit cannot be persisted', async () => {
    mocks.consumeClaim.mockResolvedValue({
      uid: USER_ID,
      scope: ['mcp:read'],
      godMode: true,
      bodyDigest: 'a'.repeat(64)
    })
    const authority = { active: true, actorUserId: USER_ID }
    mocks.getAuthority.mockReturnValue(authority)
    mocks.isActiveAuthority.mockImplementation((candidate, actor) => candidate === authority && actor === USER_ID)
    mocks.appendAudit.mockImplementation(async audit => {
      if (audit.phase !== 'attempt') throw new Error('audit unavailable')
    })

    await expect(toolsHandler(event(
      { userId: USER_ID },
      { 'x-mcp-secret': INTERNAL_SECRET, 'x-mcp-assertion': CLAIM }
    ))).rejects.toMatchObject({ statusCode: 503, statusMessage: 'God mode MCP audit unavailable' })

    expect(mocks.projectGodMode).toHaveBeenCalledTimes(1)
    expect(mocks.appendAudit.mock.calls.map(([audit]) => [audit.phase, audit.outcomeCode])).toEqual([
      ['attempt', 'started'],
      ['succeeded', 'catalog_projected'],
      ['failed', 'catalog_terminal_audit_failed']
    ])
  })

  it('upgrades a stale signed false bit to current owner behavior and executes a write directly through Task 5', async () => {
    mocks.consumeClaim.mockResolvedValue({
      uid: USER_ID,
      scope: ['mcp:read', 'mcp:write'],
      godMode: false,
      bodyDigest: 'b'.repeat(64)
    })
    const authority = { active: true, actorUserId: USER_ID }
    mocks.getAuthority.mockReturnValue(authority)
    mocks.isActiveAuthority.mockImplementation((candidate, actor) => candidate === authority && actor === USER_ID)
    const idempotencyKey = `mcp:${'c'.repeat(64)}`
    const requestEvent = event(
      { userId: USER_ID, tool: 'create_task', args: { title: 'Ship' }, idempotencyKey },
      { 'x-mcp-secret': INTERNAL_SECRET, 'x-mcp-assertion': CLAIM }
    )
    requestEvent.path = '/api/internal/mcp/call'

    await expect(callHandler(requestEvent)).resolves.toEqual({
      ok: true,
      data: { resultRef: 'task-1', directExecution: true }
    })
    expect(mocks.executeGodModeMcpCall).toHaveBeenCalledWith({
      event: requestEvent,
      claim: expect.objectContaining({ uid: USER_ID, godMode: false }),
      authority,
      idempotencyKey,
      toolName: 'create_task',
      args: { title: 'Ship' },
      requireWriteScope: true
    })
    expect(mocks.executeReadOnly).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('keeps ordinary write projection and confirmation behavior unchanged', async () => {
    mocks.consumeClaim.mockResolvedValue({ uid: USER_ID, scope: ['mcp:read', 'mcp:write'], godMode: false })
    mocks.getAuthority.mockReturnValue({ active: false, actorUserId: USER_ID })
    mocks.isActiveAuthority.mockReturnValue(false)

    const requestEvent = event(
      { userId: USER_ID },
      { 'x-mcp-secret': INTERNAL_SECRET, 'x-mcp-assertion': CLAIM }
    )
    await toolsHandler(requestEvent)

    expect(mocks.projectRegistered).toHaveBeenCalledWith(expect.objectContaining({
      role: 'member',
      scopes: ['mcp:read', 'mcp:write'],
      requireWriteScope: true
    }))
    expect(mocks.projectGodMode).not.toHaveBeenCalled()

    const confirmEvent = event(
      {
        userId: USER_ID,
        tool: 'confirm_action',
        args: { proposalId: '22222222-2222-4222-8222-222222222222' },
        idempotencyKey: `mcp:${'d'.repeat(64)}`
      },
      { 'x-mcp-secret': INTERNAL_SECRET, 'x-mcp-assertion': CLAIM }
    )
    confirmEvent.path = '/api/internal/mcp/call'
    await expect(callHandler(confirmEvent)).resolves.toEqual({
      ok: true,
      data: { resultRef: 'task-ordinary' }
    })
    expect(mocks.executeWriteConfirm).toHaveBeenCalled()
    expect(mocks.executeGodModeMcpCall).not.toHaveBeenCalled()
  })

  it('does not verify or consume a claim when the independent service secret is absent', async () => {
    await expect(toolsHandler(event(
      { userId: USER_ID },
      { 'x-mcp-assertion': CLAIM }
    ))).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.consumeClaim).not.toHaveBeenCalled()
  })

  it('rejects a non-protocol logical idempotency key before consuming the claim', async () => {
    const requestEvent = event(
      { userId: USER_ID, tool: 'get_tasks', args: {}, idempotencyKey: 'mcp:timestamp-or-jti' },
      { 'x-mcp-secret': INTERNAL_SECRET, 'x-mcp-assertion': CLAIM }
    )
    requestEvent.path = '/api/internal/mcp/call'

    await expect(callHandler(requestEvent)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.consumeClaim).not.toHaveBeenCalled()
  })
})
