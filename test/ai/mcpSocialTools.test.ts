import { beforeEach, describe, expect, it, vi } from 'vitest'

// Task 3 MCP social suite at the real tools/list + tools/call routes: real policy, fresh staff
// authority, runtime config, projection, scope classification, legacy propose_schedule_post tool and
// confirm dispatcher. Storage, the signed claim and the social executor's database work are faked;
// the database-backed suite behaviour is covered by test/server/api/socialPublishingRevisionDispatch.
const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  execute: vi.fn(),
  consumeClaim: vi.fn(),
  socialExecute: vi.fn(),
  internalFetch: vi.fn(),
  pending: null as null | { tool_name: string, resolved_payload: unknown }
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
  queryOneFresh: mocks.queryOne,
  queryRowsFresh: mocks.queryRows,
  queryCount: vi.fn(async () => 0),
  execute: mocks.execute,
  transaction: vi.fn()
}))
vi.mock('~~/server/utils/ai/mcp/requestClaim', () => ({
  consumeMcpRequestClaim: mocks.consumeClaim,
  getMcpRequestGodModeAuthority: vi.fn(() => ({ active: false }))
}))
vi.mock('~~/server/utils/godMode/authority', () => ({
  isActiveGodModeAuthority: vi.fn(() => false),
  isGodModeAuthorityForActor: vi.fn(() => false)
}))
vi.mock('~~/server/utils/godMode/audit', () => ({ appendGodModeAuditEvent: vi.fn() }))
vi.mock('~~/server/utils/ai/mcp/directExecution', () => ({ executeGodModeMcpCall: vi.fn() }))
vi.mock('~~/server/utils/ai/tools/remember', () => ({ executeOrdinaryMcpRememberMutation: vi.fn() }))
vi.mock('~~/server/utils/ai/executors/internalExecutionFetch', () => ({ fetchInternalExecution: mocks.internalFetch }))
vi.mock('~~/server/utils/ai/mcp/socialTools', async () => {
  const actual = await vi.importActual<typeof import('~~/server/utils/ai/mcp/socialTools')>('~~/server/utils/ai/mcp/socialTools')
  return { ...actual, executeSocialMcpTool: mocks.socialExecute }
})
vi.mock('~~/server/utils/ai/tools', async () => {
  const { createTaskTool } = await vi.importActual<typeof import('~~/server/utils/ai/tools/createTask')>('~~/server/utils/ai/tools/createTask')
  const { scheduleSocialPostTool } = await vi.importActual<typeof import('~~/server/utils/ai/tools/scheduleSocialPost')>('~~/server/utils/ai/tools/scheduleSocialPost')
  return { registry: [createTaskTool, scheduleSocialPostTool] }
})

const { default: callHandler } = await import('../../server/api/internal/mcp/call.post')
const { default: toolsHandler } = await import('../../server/api/internal/mcp/tools.post')
const { registeredMcpSuites, staffOnlyMcpSuites, projectStaffOnlyMcpTools } = await import('~~/server/utils/ai/mcp/registry')
const { isWriteScopeToolName } = await import('~~/server/utils/ai/mcp/scope')
const { executeWriteConfirm } = await import('~~/server/utils/ai/mcp/writeTools')
const { SOCIAL_MCP_TOOL_NAMES, SOCIAL_MCP_WRITE_TOOLS, SOCIAL_MCP_READ_TOOLS } = await import('~~/server/utils/ai/mcp/socialToolNames')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CUSTOM_ROLE = '22222222-2222-4222-8222-222222222222'
const CLIENT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const PROPOSAL_ID = '33333333-3333-4333-8333-333333333333'
const SECRET = 'internal-service-secret'

let actor: { role: string, groups: string[], readOnly?: boolean }
let assignments: string[]
let scopes: string[]
let bindings: Record<string, string>
let keySeed = 0

function request(path: string, body: Record<string, unknown>) {
  return {
    body,
    headers: { 'x-mcp-secret': SECRET, 'x-mcp-assertion': 'signed-claim' },
    context: { cloudflare: { env: bindings } },
    method: 'POST',
    path
  } as any
}
async function listNames(): Promise<string[]> {
  const result = await toolsHandler(request('/api/internal/mcp/tools', { userId: USER_ID })) as any
  return result.tools.map((tool: { name: string }) => tool.name)
}
function call(tool: string, args: Record<string, unknown> = {}) {
  keySeed += 1
  return callHandler(request('/api/internal/mcp/call', {
    userId: USER_ID, tool, args, idempotencyKey: `mcp:${keySeed.toString(16).padStart(64, '0')}`
  })) as Promise<any>
}
const sqlSeen = (fragment: string) => [...mocks.queryOne.mock.calls, ...mocks.execute.mock.calls]
  .some(([sql]) => typeof sql === 'string' && sql.includes(fragment))

describe('MCP social draft suite and legacy social bypass closure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('MCP_INTERNAL_SECRET', SECRET)
    actor = { role: 'creative', groups: ['CREATIVE'] }
    assignments = [CLIENT_A]
    scopes = ['mcp:read', 'mcp:write']
    bindings = {
      MCP_SERVER_ENABLED: 'true',
      MCP_WRITE_TOOLS_ENABLED: 'true',
      MCP_MARKETING_STAFF_GRANTS: JSON.stringify({ [USER_ID]: ['social_draft'] })
    }
    mocks.pending = null
    mocks.consumeClaim.mockImplementation(async () => ({ uid: USER_ID, scope: scopes, bodyDigest: 'e'.repeat(64) }))
    mocks.execute.mockResolvedValue(1)
    mocks.socialExecute.mockResolvedValue({ ok: true, data: { postId: 'p1' } })
    mocks.internalFetch.mockResolvedValue({ id: 'legacy-post' })
    mocks.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM team_members')) return { role: actor.role, custom_role_id: CUSTOM_ROLE, name: 'Staff', email: 's@example.test' }
      if (sql.includes('FROM custom_roles')) return { is_read_only: actor.readOnly === true, permission_groups: actor.groups }
      if (sql.includes('ai_action_audit')) return { n: 0 }
      if (sql.includes('UPDATE ai_pending_actions SET status=\'executed\'')) return mocks.pending
      if (sql.includes('INSERT INTO ai_pending_actions')) return { id: PROPOSAL_ID }
      return null
    })
    mocks.queryRows.mockImplementation(async (sql: string) => (
      sql.includes('client_team_assignments') ? assignments.map(client_id => ({ client_id })) : []
    ))
  })

  it('classifies the three local mutations as write-class and the three reads as reads', () => {
    for (const name of SOCIAL_MCP_WRITE_TOOLS) expect(isWriteScopeToolName(name)).toBe(true)
    for (const name of SOCIAL_MCP_READ_TOOLS) expect(isWriteScopeToolName(name)).toBe(false)
  })

  it('keeps the suite out of the owner union and exposes only local, non-provider descriptors', () => {
    expect(registeredMcpSuites.map(suite => suite.key)).not.toContain('social-drafts')
    const suite = staffOnlyMcpSuites.find(s => s.key === 'social-drafts')
    expect(suite!.key).toBe('social-drafts')
    const context = { tools: [], role: 'creative', scopes: [], requireWriteScope: true, suiteFlags: {} as any }
    expect(projectStaffOnlyMcpTools(context, [suite!]).map(tool => tool.name).sort()).toEqual([...SOCIAL_MCP_TOOL_NAMES].sort())
    for (const descriptor of suite!.executions(context)) {
      expect(descriptor.executeSupplemental).toBeUndefined()
      if (descriptor.tool.mutates) expect(descriptor.executionClass).toBe('local-transactional')
      else expect(descriptor.executionClass).toBeUndefined()
    }
    expect(suite!.executions(context).map(d => d.name)).not.toContain('publish_social_post')
  })

  it('projects the suite to granted, assigned staff only, and only reads without signed write consent', async () => {
    const names = await listNames()
    expect(names).toEqual(expect.arrayContaining([...SOCIAL_MCP_TOOL_NAMES]))
    expect(names).not.toContain('propose_schedule_post')

    scopes = ['mcp:read']
    expect((await listNames()).filter(name => SOCIAL_MCP_TOOL_NAMES.includes(name as never)).sort()).toEqual([...SOCIAL_MCP_READ_TOOLS].sort())

    scopes = ['mcp:read', 'mcp:write']
    assignments = []
    expect((await listNames()).some(name => SOCIAL_MCP_TOOL_NAMES.includes(name as never))).toBe(false)

    assignments = [CLIENT_A]
    bindings.MCP_MARKETING_STAFF_GRANTS = JSON.stringify({ [USER_ID]: ['reporting'] })
    expect((await listNames()).some(name => SOCIAL_MCP_TOOL_NAMES.includes(name as never))).toBe(false)

    bindings.MCP_MARKETING_STAFF_GRANTS = JSON.stringify({ [USER_ID]: ['social_draft'] })
    actor.readOnly = true
    expect((await listNames()).filter(name => SOCIAL_MCP_TOOL_NAMES.includes(name as never)).sort()).toEqual([...SOCIAL_MCP_READ_TOOLS].sort())
  })

  it('denies a stale-catalog direct call before the executor when grant, scope or assignment is missing', async () => {
    scopes = ['mcp:read']
    await expect(call('create_social_post_draft', { clientId: CLIENT_A })).resolves.toMatchObject({ ok: false, code: 'insufficient_scope' })
    scopes = ['mcp:read', 'mcp:write']
    bindings.MCP_MARKETING_STAFF_GRANTS = '{}'
    await expect(call('create_social_post_draft', { clientId: CLIENT_A })).resolves.toMatchObject({ ok: false, code: 'capability_required' })
    bindings.MCP_MARKETING_STAFF_GRANTS = JSON.stringify({ [USER_ID]: ['social_draft'] })
    assignments = []
    await expect(call('list_social_publishing_accounts', { clientId: CLIENT_A })).resolves.toMatchObject({ ok: false, code: 'no_client_assignments' })
    expect(mocks.socialExecute).not.toHaveBeenCalled()

    assignments = [CLIENT_A]
    await expect(call('create_social_post_draft', { clientId: CLIENT_A })).resolves.toMatchObject({ ok: true })
    expect(mocks.socialExecute).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'create_social_post_draft', userId: USER_ID, sessionDigest: 'e'.repeat(64),
      idempotencyKey: expect.stringMatching(/^mcp:[0-9a-f]{64}$/)
    }))
  })

  it('routes management staff to the same reviewed suite and never offers the legacy self-approvable proposal', async () => {
    actor = { role: 'lead', groups: ['MANAGEMENT', 'CREATIVE'] }
    const names = await listNames()
    expect(names).toContain('propose_create_task')
    expect(names).toContain('confirm_action')
    expect(names).not.toContain('propose_schedule_post')
    expect(names).toEqual(expect.arrayContaining([...SOCIAL_MCP_TOOL_NAMES]))

    await expect(call('propose_schedule_post', { clientName: 'Acme', content: 'Hi' }))
      .resolves.toMatchObject({ ok: false, code: 'review_required', error: expect.stringContaining('create_social_post_draft') })
    expect(sqlSeen('INSERT INTO ai_pending_actions')).toBe(false)

    await expect(call('list_social_publishing_accounts', { clientId: CLIENT_A })).resolves.toMatchObject({ ok: true })
    expect(mocks.socialExecute).toHaveBeenCalledTimes(1)

    bindings.MCP_MARKETING_STAFF_GRANTS = '{}'
    expect((await listNames()).some(name => SOCIAL_MCP_TOOL_NAMES.includes(name as never))).toBe(false)
    await expect(call('create_social_post_draft', { clientId: CLIENT_A })).resolves.toMatchObject({ ok: false })
    expect(mocks.socialExecute).toHaveBeenCalledTimes(1)
  })

  it('refuses to confirm a retained ordinary-MCP social proposal and restores the row untouched', async () => {
    actor = { role: 'lead', groups: ['MANAGEMENT', 'CREATIVE'] }
    mocks.pending = { tool_name: 'propose_schedule_post', resolved_payload: { clientId: CLIENT_A, content: 'Stale', status: 'scheduled', scheduledAt: '2030-01-01T00:00:00.000Z' } }
    await expect(call('confirm_action', { proposalId: PROPOSAL_ID }))
      .resolves.toMatchObject({ ok: false, code: 'forbidden', error: expect.stringContaining('submit_social_post_for_review') })
    expect(sqlSeen('UPDATE ai_pending_actions SET status=\'executed\'')).toBe(true)
    expect(mocks.execute.mock.calls.some(([sql]) => String(sql).includes('SET status=\'proposed\''))).toBe(true)
    expect(mocks.internalFetch).not.toHaveBeenCalled()
  })

  it('leaves non-staff (owner / in-app) confirmations of the legacy tool on their existing path', async () => {
    const executor = { toolName: 'propose_schedule_post', label: 'social post', riskTier: 'confirm' as const, requiredPermission: 'CREATIVE' as const, execute: vi.fn(async () => ({ resultRef: 'p', summary: 'ok' })) }
    const deps = {
      enabled: true,
      writeEnabled: true,
      claim: async () => ({ tool_name: 'propose_schedule_post', resolved_payload: {} }),
      getExecutor: () => executor as any
    }
    const legacy = await executeWriteConfirm({ proposalId: PROPOSAL_ID }, { userId: USER_ID, userRole: 'owner', event: {} as any }, deps)
    expect(legacy).toMatchObject({ ok: true })
    expect(executor.execute).toHaveBeenCalledTimes(1)

    const revert = vi.fn(async () => {})
    const fresh = await executeWriteConfirm({ proposalId: PROPOSAL_ID }, {
      userId: USER_ID, userRole: 'admin', permissionGroups: ['ADMIN', 'MANAGEMENT', 'CREATIVE'], mcpStaffAuthority: 'fresh', event: {} as any
    }, { ...deps, revertClaim: revert })
    expect(fresh).toMatchObject({ ok: false, code: 'forbidden' })
    expect(revert).toHaveBeenCalledTimes(1)
    expect(executor.execute).toHaveBeenCalledTimes(1)
  })
})
