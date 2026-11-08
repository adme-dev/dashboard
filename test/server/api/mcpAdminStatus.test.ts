// Admin MCP rollout diagnostic (/api/admin/ai/mcp/status) must report the suites the Worker
// actually serves: shared runtime resolver (bindings first, compact MCP_SUITE_CONFIG, explicit
// false precedence), preserved admin/owner auth + audit read, and no secret/grant disclosure.
import type { H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  queryRows: vi.fn(),
  resolveAuthority: vi.fn(),
  isActiveAuthority: vi.fn(),
  projectGodMode: vi.fn(),
  projectRegistered: vi.fn()
}))

vi.mock('h3', () => ({
  defineEventHandler: <T>(handler: T) => handler
}))
vi.mock('~~/server/utils/auth', () => ({ requireRole: mocks.requireRole }))
// Partial: the shared runtime resolver's import chain needs the module's other exports.
vi.mock('~~/server/utils/db', async importOriginal => ({
  ...(await importOriginal<typeof import('~~/server/utils/db')>()),
  queryRows: mocks.queryRows
}))
vi.mock('~~/server/utils/ai/tools', () => ({ registry: [{ name: 'registry-tool' }] }))
vi.mock('~~/server/utils/ai/mcp/registry', () => ({
  projectGodModeTools: mocks.projectGodMode,
  projectRegisteredMcpTools: mocks.projectRegistered,
  registeredMcpSuites: [{ key: 'core' }, { key: 'financial' }]
}))
vi.mock('~~/server/utils/godMode/authority', () => ({
  resolveGodModeAuthority: mocks.resolveAuthority,
  isActiveGodModeAuthority: mocks.isActiveAuthority
}))

const { default: handler } = await import('../../../server/api/admin/ai/mcp/status.get')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const GRANTED_USER_ID = '22222222-2222-4222-8222-222222222222'

const SUITE_KEYS = [
  'generation', 'writes', 'financial', 'video', 'videoGeneration', 'banners', 'feeds',
  'googleAdsRead', 'googleAdsWrite', 'googleAdsAutomation', 'googleAdsDestructive'
] as const
const ALL_OFF = Object.fromEntries(SUITE_KEYS.map(key => [key, false]))

const RUNTIME_KEYS = [
  'MCP_SERVER_ENABLED', 'MCP_WORKER_ORIGIN', 'MCP_REQUIRE_WRITE_SCOPE', 'MCP_SUITE_CONFIG',
  'MCP_GEN_TOOLS_ENABLED', 'MCP_WRITE_TOOLS_ENABLED', 'MCP_FINANCIAL_TOOLS_ENABLED',
  'MCP_VIDEO_TOOLS_ENABLED', 'MCP_VIDEO_GEN_ENABLED', 'MCP_BANNER_TOOLS_ENABLED', 'MCP_FEED_TOOLS_ENABLED',
  'GOOGLE_ADS_MCP_READ_ENABLED', 'GOOGLE_ADS_MCP_WRITE_ENABLED', 'GOOGLE_ADS_MCP_AUTOMATION_ENABLED',
  'GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED', 'MCP_MARKETING_STAFF_GRANTS',
  'MCP_INTERNAL_SECRET', 'MCP_REQUEST_SIGNING_SECRET', 'GOD_MODE_INTERNAL_EXECUTION_SECRET'
]

function eventWith(env?: Record<string, unknown>) {
  return { context: env ? { cloudflare: { env } } : {} } as unknown as H3Event
}

describe('admin MCP status rollout diagnostic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of RUNTIME_KEYS) vi.stubEnv(key, undefined)
    mocks.requireRole.mockResolvedValue({ id: USER_ID, role: 'owner' })
    mocks.queryRows.mockResolvedValue([
      { id: 'audit-1', route_or_tool: 'get_tasks', phase: 'execute', outcome_code: 'ok', created_at: '2026-11-08T00:00:00Z' }
    ])
    mocks.resolveAuthority.mockResolvedValue({ active: true, actorUserId: USER_ID, emergencyDisabled: false })
    mocks.isActiveAuthority.mockReturnValue(true)
    mocks.projectGodMode.mockReturnValue([{ name: 'get_tasks', description: 'Core read', inputSchema: {} }])
    mocks.projectRegistered.mockReturnValue([])
  })
  afterEach(() => vi.unstubAllEnvs())

  it('reports compact MCP_SUITE_CONFIG suites from the request binding, with admin auth and audit preserved', async () => {
    const event = eventWith({
      MCP_SERVER_ENABLED: 'true',
      MCP_WORKER_ORIGIN: 'https://mcp.example.test',
      MCP_SUITE_CONFIG: JSON.stringify({ generation: true, financial: true, googleAdsRead: true })
    })

    const result = await handler(event)

    expect(mocks.requireRole).toHaveBeenCalledWith(event, ['admin', 'owner'])
    expect(mocks.resolveAuthority).toHaveBeenCalledWith(event, USER_ID)
    const expectedFlags = { ...ALL_OFF, generation: true, financial: true, googleAdsRead: true }
    expect(result.suiteFlags).toEqual(expectedFlags)
    // The projection receives exactly the resolved flags, so toolCount matches what tools/list serves.
    expect(mocks.projectGodMode).toHaveBeenCalledWith(expect.objectContaining({
      role: 'owner',
      tools: [{ name: 'registry-tool' }],
      scopes: ['mcp:read', 'mcp:write'],
      requireWriteScope: false,
      suiteFlags: expectedFlags
    }))
    expect(mocks.projectRegistered).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      enabled: true,
      workerOrigin: 'https://mcp.example.test',
      authority: 'god_mode',
      role: 'owner',
      toolCount: 1,
      tools: [{ name: 'get_tasks', description: 'Core read' }],
      suites: [{ key: 'core' }, { key: 'financial' }],
      recentAudit: [{ id: 'audit-1', tool: 'get_tasks', phase: 'execute', outcome: 'ok', createdAt: '2026-11-08T00:00:00Z' }]
    })
    expect(String(mocks.queryRows.mock.calls[0]?.[0])).toContain('WHERE channel = \'mcp\'')
  })

  it('lets an explicit false or non-string legacy binding beat compact and local true values', async () => {
    vi.stubEnv('MCP_GEN_TOOLS_ENABLED', 'true')
    vi.stubEnv('MCP_SERVER_ENABLED', 'true')
    vi.stubEnv('MCP_REQUIRE_WRITE_SCOPE', 'true')
    const event = eventWith({
      MCP_SERVER_ENABLED: 'false',
      MCP_REQUIRE_WRITE_SCOPE: 'false',
      MCP_SUITE_CONFIG: JSON.stringify({ generation: true, financial: true, writes: true }),
      MCP_GEN_TOOLS_ENABLED: 'false',
      MCP_FINANCIAL_TOOLS_ENABLED: undefined
    })

    const result = await handler(event)

    expect(result.enabled).toBe(false)
    expect(result.safeguards.writeScopeRequired).toBe(false)
    expect(result.suiteFlags).toEqual({ ...ALL_OFF, writes: true })
    expect(mocks.projectGodMode).toHaveBeenCalledWith(expect.objectContaining({
      requireWriteScope: false,
      suiteFlags: { ...ALL_OFF, writes: true }
    }))
  })

  it('falls back to the local process environment and default origin when no bindings exist', async () => {
    vi.stubEnv('MCP_SERVER_ENABLED', 'true')
    vi.stubEnv('MCP_SUITE_CONFIG', JSON.stringify({ banners: true }))
    vi.stubEnv('MCP_FEED_TOOLS_ENABLED', 'true')
    mocks.requireRole.mockResolvedValue({ id: USER_ID, role: 'admin' })
    mocks.isActiveAuthority.mockReturnValue(false)
    mocks.projectRegistered.mockReturnValue([{ name: 'get_tasks', description: 'Core read', inputSchema: {} }])

    const result = await handler(eventWith())

    expect(result).toMatchObject({
      enabled: true,
      workerOrigin: 'https://mcp-server.adme-dev.workers.dev',
      authority: 'governed',
      role: 'admin',
      toolCount: 1
    })
    expect(result.suiteFlags).toEqual({ ...ALL_OFF, banners: true, feeds: true })
    expect(mocks.projectRegistered).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin', suiteFlags: result.suiteFlags }))
    expect(mocks.projectGodMode).not.toHaveBeenCalled()
  })

  it('reports secret health as presence only and never discloses secret values or staff grants', async () => {
    const grants = JSON.stringify({ [GRANTED_USER_ID]: ['marketing_campaign_read'] })
    const event = eventWith({
      MCP_SERVER_ENABLED: 'true',
      MCP_INTERNAL_SECRET: 'internal-secret-value',
      MCP_REQUEST_SIGNING_SECRET: 'signing-secret-value',
      GOD_MODE_INTERNAL_EXECUTION_SECRET: 'execution-secret-value',
      MCP_MARKETING_STAFF_GRANTS: grants
    })
    mocks.resolveAuthority.mockResolvedValue({ active: true, actorUserId: USER_ID, emergencyDisabled: true })

    const result = await handler(event)
    const serialized = JSON.stringify(result)

    expect(result.safeguards).toEqual({
      writeScopeRequired: false,
      emergencyDisabled: true,
      internalSecretConfigured: true,
      requestSigningSecretConfigured: true,
      internalExecutionSecretConfigured: true
    })
    for (const forbidden of ['internal-secret-value', 'signing-secret-value', 'execution-secret-value', GRANTED_USER_ID, 'marketing_campaign_read', 'marketingStaffGrants', 'MCP_INTERNAL_SECRET']) {
      expect(serialized).not.toContain(forbidden)
    }
    expect(Object.keys(result).sort()).toEqual([
      'authority', 'enabled', 'recentAudit', 'role', 'safeguards', 'suiteFlags', 'suites', 'toolCount', 'tools', 'workerOrigin'
    ])
  })

  it('mirrors each secret reader: a present non-string handshake binding fails closed, fallback readers use local env', async () => {
    vi.stubEnv('MCP_INTERNAL_SECRET', 'local-internal')
    vi.stubEnv('MCP_REQUEST_SIGNING_SECRET', 'local-signing')
    vi.stubEnv('GOD_MODE_INTERNAL_EXECUTION_SECRET', '   ')
    const event = eventWith({
      MCP_INTERNAL_SECRET: undefined,
      MCP_REQUEST_SIGNING_SECRET: 123
    })

    const result = await handler(event)

    expect(result.safeguards.internalSecretConfigured).toBe(false)
    expect(result.safeguards.requestSigningSecretConfigured).toBe(true)
    expect(result.safeguards.internalExecutionSecretConfigured).toBe(false)
    expect(JSON.stringify(result)).not.toContain('local-')
  })
})
