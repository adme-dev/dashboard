import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// Route-level staff catalog regressions. Policy, staff authority, runtime config and projection are the
// real modules; only storage, the signed request claim, owner authority and the tool registry are faked.
const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  execute: vi.fn(),
  consumeClaim: vi.fn(),
  getAuthority: vi.fn(),
  resolveAuthority: vi.fn(),
  isActiveAuthority: vi.fn(),
  executeGodModeMcpCall: vi.fn(),
  executeRemember: vi.fn(),
  requireAuth: vi.fn(),
  resolveUserPermissions: vi.fn(),
  getAssignedClientIds: vi.fn(),
  handlers: {} as Record<string, ReturnType<typeof vi.fn>>
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
  // Staff authority reads through the uncached primitives; the same SQL-aware fixture answers both.
  queryOneFresh: mocks.queryOne,
  queryRowsFresh: mocks.queryRows,
  execute: mocks.execute,
  transaction: vi.fn()
}))
vi.mock('~~/server/utils/ai/mcp/requestClaim', () => ({
  consumeMcpRequestClaim: mocks.consumeClaim,
  getMcpRequestGodModeAuthority: mocks.getAuthority
}))
vi.mock('~~/server/utils/godMode/authority', () => ({
  resolveGodModeAuthority: mocks.resolveAuthority,
  isActiveGodModeAuthority: mocks.isActiveAuthority,
  isGodModeAuthorityForActor: vi.fn(() => false)
}))
vi.mock('~~/server/utils/godMode/audit', () => ({ appendGodModeAuditEvent: vi.fn() }))
vi.mock('~~/server/utils/ai/mcp/directExecution', () => ({ executeGodModeMcpCall: mocks.executeGodModeMcpCall }))
vi.mock('~~/server/utils/ai/tools/remember', () => ({ executeOrdinaryMcpRememberMutation: mocks.executeRemember }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('~~/server/utils/roleResolver', () => ({ resolveUserPermissions: mocks.resolveUserPermissions }))
vi.mock('~~/server/utils/clientScoping', () => ({ getAssignedClientIds: mocks.getAssignedClientIds }))
vi.mock('~~/server/utils/ai/tools', () => {
  const read = (name: string, requiredPermission?: string) => {
    const handler = vi.fn(async () => ({ ok: true, data: { tool: name } }))
    mocks.handlers[name] = handler
    return {
      name,
      description: `${name} description`,
      parameters: z.object({}).passthrough(),
      ...(requiredPermission ? { requiredPermission } : {}),
      handler
    }
  }
  const createTask = {
    name: 'create_task',
    description: 'Create a task',
    parameters: z.object({ title: z.string() }),
    mutates: true,
    handler: vi.fn(async () => ({ ok: true, data: { proposalId: 'p1' } }))
  }
  mocks.handlers.create_task = createTask.handler
  return {
    registry: [
      read('get_tasks'),
      read('get_leads'),
      read('get_client_overview', 'CLIENTS'),
      read('get_client_profitability', 'FINANCE'),
      read('get_campaign_breakdown', 'MEDIA_BUYING'),
      read('get_adspend_pacing', 'FINANCE'),
      read('get_finance_snapshot', 'FINANCE'),
      createTask,
      {
        name: 'remember',
        description: 'Save a private note',
        parameters: z.object({ content: z.string() }),
        mutates: true,
        directMutation: { executionClass: 'local-transactional', execute: vi.fn() },
        handler: vi.fn()
      }
    ]
  }
})

const { default: toolsHandler } = await import('../../../server/api/internal/mcp/tools.post')
const { default: callHandler } = await import('../../../server/api/internal/mcp/call.post')
const { default: myToolsHandler } = await import('../../../server/api/agency/ai/mcp/my-tools.get')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CUSTOM_ROLE = '22222222-2222-4222-8222-222222222222'
const CLIENT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SECRET = 'internal-service-secret'
const DIGEST = 'e'.repeat(64)

interface Actor {
  role: string
  customRoleId?: string | null
  customRole?: { is_read_only: boolean, permission_groups: string[] } | null
  active?: boolean
  assignments?: string[]
}

let actor: Actor
let scopes: string[]
let bindings: Record<string, string>

function requestEvent(body: Record<string, unknown>, path = '/api/internal/mcp/tools') {
  return {
    body,
    headers: { 'x-mcp-secret': SECRET, 'x-mcp-assertion': 'signed-claim' },
    context: { cloudflare: { env: bindings } },
    method: 'POST',
    path
  } as any
}

let keySeed = 0
function call(tool: string, args: Record<string, unknown> = {}) {
  keySeed += 1
  return callHandler(requestEvent({
    userId: USER_ID,
    tool,
    args,
    idempotencyKey: `mcp:${keySeed.toString(16).padStart(64, '0')}`
  }, '/api/internal/mcp/call'))
}

async function listedNames(): Promise<string[]> {
  const result = await toolsHandler(requestEvent({ userId: USER_ID })) as { tools: Array<{ name: string }> }
  return result.tools.map(tool => tool.name).sort()
}

describe('ordinary staff MCP catalog boundary', () => {
  afterEach(() => vi.unstubAllEnvs())

  beforeEach(() => {
    vi.clearAllMocks()
    actor = { role: 'media_buyer', assignments: [CLIENT_A] }
    scopes = ['mcp:read']
    // Legacy opt-out flags deliberately OFF in the process; the request binding is authoritative.
    vi.stubEnv('MCP_SERVER_ENABLED', 'false')
    vi.stubEnv('MCP_INTERNAL_SECRET', SECRET)
    vi.stubEnv('MCP_REQUIRE_WRITE_SCOPE', 'false')
    bindings = { MCP_SERVER_ENABLED: 'true', MCP_WRITE_TOOLS_ENABLED: 'true', MCP_REQUIRE_WRITE_SCOPE: 'false' }
    mocks.consumeClaim.mockImplementation(async () => ({ uid: USER_ID, scope: scopes, bodyDigest: DIGEST }))
    mocks.getAuthority.mockReturnValue({ active: false, actorUserId: USER_ID })
    mocks.resolveAuthority.mockResolvedValue({ active: false, actorUserId: USER_ID })
    mocks.isActiveAuthority.mockReturnValue(false)
    mocks.execute.mockResolvedValue(1)
    mocks.executeRemember.mockResolvedValue({ ok: true, data: { remembered: true } })
    mocks.requireAuth.mockImplementation(async () => ({ id: USER_ID, role: actor.role }))
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM team_members')) {
        return actor.active === false
          ? null
          : { role: actor.role, custom_role_id: actor.customRoleId ?? null, name: 'Staff', email: 'staff@example.test' }
      }
      if (sql.includes('FROM custom_roles')) return sql.includes('cr.id = $1') ? (actor.customRole ?? null) : null
      if (sql.includes('ai_action_audit')) return { n: 0 }
      return null
    })
    mocks.queryRows.mockImplementation(async (sql: string) => (
      sql.includes('client_team_assignments') ? (actor.assignments ?? []).map(client_id => ({ client_id })) : []
    ))
  })

  it('lists the reviewed pilot reads and scoped overview for enrolled non-management staff', async () => {
    bindings.MCP_MARKETING_STAFF_GRANTS = JSON.stringify({ [USER_ID]: ['reporting'] })
    expect(await listedNames()).toEqual(['get_adspend_pacing', 'get_campaign_breakdown', 'get_client_overview', 'get_tasks'])
    scopes = ['mcp:read', 'mcp:write']
    expect(await listedNames()).toEqual(['get_adspend_pacing', 'get_campaign_breakdown', 'get_client_overview', 'get_tasks', 'remember'])
    expect(mocks.resolveUserPermissions).not.toHaveBeenCalled()
    expect(mocks.getAssignedClientIds).not.toHaveBeenCalled()
  })

  it('denies stale-catalog direct calls to unreviewed tools before any handler runs', async () => {
    bindings.MCP_MARKETING_STAFF_GRANTS = JSON.stringify({ [USER_ID]: ['reporting', 'social_draft', 'ads_plan', 'tracking_plan'] })
    scopes = ['mcp:read', 'mcp:write']
    for (const name of ['get_leads', 'get_client_profitability', 'get_finance_snapshot']) {
      await expect(call(name, name === 'get_leads' ? { summary: true } : {})).resolves.toMatchObject({ ok: false, code: 'not_reviewed' })
      expect(mocks.handlers[name]).not.toHaveBeenCalled()
    }
    await expect(call('propose_create_task', { title: 'x' })).resolves.toMatchObject({ ok: false, code: 'not_reviewed' })
    expect(mocks.handlers.create_task).not.toHaveBeenCalled()
    await expect(call('confirm_action', { proposalId: '33333333-3333-4333-8333-333333333333' }))
      .resolves.toMatchObject({ ok: false, code: 'not_reviewed' })
  })

  it('executes a reviewed tool for staff and records the call audit', async () => {
    await expect(call('get_tasks')).resolves.toMatchObject({ ok: true, data: { tool: 'get_tasks' } })
    expect(mocks.handlers.get_tasks).toHaveBeenCalledWith({}, expect.objectContaining({
      userId: USER_ID,
      permissionGroups: ['MEDIA_BUYING'],
      assistantScope: expect.objectContaining({ clientAccessMode: 'assigned', assignedClientIds: [CLIENT_A] })
    }))
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('ai_action_audit'), expect.any(Array))
  })

  it('enforces write scope for ordinary staff despite the legacy opt-out flag', async () => {
    await expect(call('remember', { content: 'x' })).resolves.toMatchObject({ ok: false, code: 'insufficient_scope' })
    expect(mocks.executeRemember).not.toHaveBeenCalled()
    scopes = ['mcp:read', 'mcp:write']
    await expect(call('remember', { content: 'x' })).resolves.toMatchObject({ ok: true })
    expect(mocks.executeRemember).toHaveBeenCalledTimes(1)
  })

  it('applies a read-only custom role immediately to list and call', async () => {
    actor = { role: 'media_buyer', customRoleId: CUSTOM_ROLE, customRole: { is_read_only: true, permission_groups: [] }, assignments: [CLIENT_A] }
    scopes = ['mcp:read', 'mcp:write']
    expect(await listedNames()).toEqual(['get_tasks'])
    await expect(call('remember', { content: 'x' })).resolves.toMatchObject({ ok: false, code: 'read_only' })
    expect(mocks.executeRemember).not.toHaveBeenCalled()
  })

  it('rejects deactivated actors on list and call', async () => {
    actor = { ...actor, active: false }
    await expect(toolsHandler(requestEvent({ userId: USER_ID }))).rejects.toMatchObject({ statusCode: 403 })
    await expect(call('get_tasks')).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.handlers.get_tasks).not.toHaveBeenCalled()
  })

  it('keeps management paths, narrowed by a fresh custom role and mandatory write scope', async () => {
    actor = { role: 'lead' }
    expect(await listedNames()).toEqual(expect.arrayContaining(['get_finance_snapshot', 'get_leads', 'get_client_overview']))
    expect(await listedNames()).not.toContain('propose_create_task')
    await expect(call('get_finance_snapshot')).resolves.toMatchObject({ ok: true })
    await expect(call('propose_create_task', { title: 'x' })).resolves.toMatchObject({ ok: false, code: 'insufficient_scope' })

    scopes = ['mcp:read', 'mcp:write']
    expect(await listedNames()).toContain('propose_create_task')
    await expect(call('propose_create_task', { title: 'x' })).resolves.toMatchObject({ ok: true })

    // Revoke FINANCE through the custom role: the legacy `lead` role no longer authorizes it.
    actor = { role: 'lead', customRoleId: CUSTOM_ROLE, customRole: { is_read_only: false, permission_groups: ['MANAGEMENT'] } }
    expect(await listedNames()).not.toContain('get_finance_snapshot')
    mocks.handlers.get_finance_snapshot.mockClear()
    await expect(call('get_finance_snapshot')).resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(mocks.handlers.get_finance_snapshot).not.toHaveBeenCalled()
  })

  it('preserves owner God-mode routing', async () => {
    const authority = { active: true, actorUserId: USER_ID }
    mocks.getAuthority.mockReturnValue(authority)
    mocks.isActiveAuthority.mockImplementation((candidate, id) => candidate === authority && id === USER_ID)
    mocks.executeGodModeMcpCall.mockResolvedValue({ ok: true, data: { directExecution: true } })
    await expect(call('create_task', { title: 'x' })).resolves.toEqual({ ok: true, data: { directExecution: true } })
    expect(mocks.executeGodModeMcpCall).toHaveBeenCalledWith(expect.objectContaining({ requireWriteScope: false }))
    expect(mocks.queryOne.mock.calls.some(([sql]) => String(sql).includes('FROM team_members'))).toBe(false)
  })

  it('previews exactly the tools/list projection for the same assumed scopes', async () => {
    bindings.MCP_WORKER_ORIGIN = 'https://mcp.binding.test'
    for (const nextActor of [
      { role: 'media_buyer', assignments: [CLIENT_A] },
      { role: 'lead' },
      { role: 'media_buyer', customRoleId: CUSTOM_ROLE, customRole: { is_read_only: true, permission_groups: [] } }
    ] as Actor[]) {
      actor = nextActor
      const preview = await myToolsHandler({ context: { cloudflare: { env: bindings } } } as any) as any
      scopes = preview.preview.assumedScopes
      expect(preview.preview.assumedScopes).toEqual(['mcp:read', 'mcp:write'])
      expect(preview.workerOrigin).toBe('https://mcp.binding.test')
      expect(preview.enabled).toBe(true)
      expect(preview.tools.map((tool: { name: string }) => tool.name).sort()).toEqual(await listedNames())
    }
  })
})
