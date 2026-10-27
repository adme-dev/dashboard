import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  resolveAuthority: vi.fn(),
  isActiveAuthority: vi.fn(),
  projectGodMode: vi.fn(),
  projectRegistered: vi.fn(),
  resolveStaff: vi.fn()
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler
}))

vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('~~/server/utils/godMode/authority', () => ({
  resolveGodModeAuthority: mocks.resolveAuthority,
  isActiveGodModeAuthority: mocks.isActiveAuthority
}))
vi.mock('~~/server/utils/ai/tools', () => ({ registry: [{ name: 'registry-tool' }] }))
vi.mock('~~/server/utils/ai/mcp/registry', () => ({
  projectGodModeTools: mocks.projectGodMode,
  projectRegisteredMcpTools: mocks.projectRegistered,
  // Task 3 staff-only suites (social drafts) are covered by test/ai/mcpSocialTools.test.ts.
  projectStaffOnlyMcpTools: () => []
}))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({ resolveMcpStaffContext: mocks.resolveStaff }))

const { default: handler } = await import('../../../../server/api/agency/ai/mcp/my-tools.get')

const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('owner-visible MCP manifest', () => {
  afterEach(() => vi.unstubAllEnvs())

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('MCP_SERVER_ENABLED', 'true')
    vi.stubEnv('MCP_WORKER_ORIGIN', 'https://mcp.example.test')
    vi.stubEnv('MCP_REQUIRE_WRITE_SCOPE', 'true')
    mocks.requireAuth.mockResolvedValue({ id: USER_ID, role: 'owner' })
    mocks.projectGodMode.mockReturnValue([
      { name: 'get_tasks', description: 'Core read', inputSchema: {} },
      { name: 'propose_schedule_post', description: 'Social publishing', inputSchema: {} },
      { name: 'generate_voiceover', description: 'Generation', inputSchema: {} },
      { name: 'propose_budget_change', description: 'Finance', inputSchema: {} },
      { name: 'list_banner_projects', description: 'Banners', inputSchema: {} },
      { name: 'list_av_projects', description: 'Video', inputSchema: {} },
      { name: 'propose_team_memory', description: 'Administration', inputSchema: {} }
    ])
    mocks.projectRegistered.mockReturnValue([
      { name: 'get_tasks', description: 'Core read', inputSchema: {} }
    ])
  })

  it('returns the same complete registered union and God-mode authority for a fresh active owner', async () => {
    const event = { context: {} } as any
    const authority = { active: true, actorUserId: USER_ID }
    mocks.resolveAuthority.mockResolvedValue(authority)
    mocks.isActiveAuthority.mockImplementation((candidate, actor) => candidate === authority && actor === USER_ID)

    const result = await handler(event)

    expect(mocks.resolveAuthority).toHaveBeenCalledWith(event, USER_ID)
    expect(mocks.projectGodMode).toHaveBeenCalledWith(expect.objectContaining({
      role: 'owner',
      tools: [{ name: 'registry-tool' }]
    }))
    expect(result).toMatchObject({
      enabled: true,
      authority: 'god_mode',
      role: 'owner',
      tools: [
        { name: 'get_tasks' },
        { name: 'propose_schedule_post' },
        { name: 'generate_voiceover' },
        { name: 'propose_budget_change' },
        { name: 'list_banner_projects' },
        { name: 'list_av_projects' },
        { name: 'propose_team_memory' }
      ]
    })
    expect(mocks.projectRegistered).not.toHaveBeenCalled()
  })

  it('previews management staff through the shared staff projection with runtime flags and assumed scopes', async () => {
    const event = { context: { cloudflare: { env: { MCP_BANNER_TOOLS_ENABLED: 'true' } } } } as any
    mocks.requireAuth.mockResolvedValue({ id: USER_ID, role: 'lead' })
    const authority = { active: false, actorUserId: USER_ID }
    mocks.resolveAuthority.mockResolvedValue(authority)
    mocks.isActiveAuthority.mockReturnValue(false)
    mocks.resolveStaff.mockResolvedValue({
      userId: USER_ID,
      userRole: 'lead',
      permissionGroups: ['MANAGEMENT'],
      assistantReadOnly: false,
      assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [] },
      mcpScopes: new Set(['mcp:read', 'mcp:write']),
      marketingCapabilities: [],
      event
    })

    const result = await handler(event)

    expect(mocks.resolveStaff).toHaveBeenCalledWith(event, USER_ID, ['mcp:read', 'mcp:write'], expect.anything())
    expect(mocks.projectRegistered).toHaveBeenCalledWith(expect.objectContaining({
      tools: [{ name: 'registry-tool' }],
      role: 'lead',
      scopes: ['mcp:read', 'mcp:write'],
      permissionGroups: ['MANAGEMENT'],
      requireWriteScope: true,
      // The preview reads the same runtime flags as tools/list instead of hard-coding them off.
      suiteFlags: expect.objectContaining({ banners: true, writes: false })
    }))
    expect(mocks.projectGodMode).not.toHaveBeenCalled()
    expect(result).toEqual({
      enabled: true,
      workerOrigin: 'https://mcp.example.test',
      role: 'lead',
      preview: { assumedScopes: ['mcp:read', 'mcp:write'], projection: 'management' },
      marketingCapabilities: [],
      access: { permissionGroups: ['MANAGEMENT'], readOnly: false, clientScope: { mode: 'all_active', assignedClientCount: null } },
      tools: [{ name: 'get_tasks', description: 'Core read', requiresWriteScope: false }]
    })
  })
})
