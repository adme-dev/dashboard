import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketingReadScope } from '~~/server/utils/ai/marketing/readScope'

const mockQueryOneFresh = vi.fn()
const mockQueryRowsFresh = vi.fn()
vi.mock('~~/server/utils/db', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  queryOneFresh: (...args: unknown[]) => mockQueryOneFresh(...args),
  queryRowsFresh: (...args: unknown[]) => mockQueryRowsFresh(...args)
}))

const { readScopedClientChangeHistory, resolveScopedClientByName } = await import('~~/server/utils/changeHistory/access')
const { getClientChangeHistoryTool, clientChangeHistoryTool } = await import('~~/server/utils/ai/tools/clientChangeHistory')
const { clientChangeHistoryEnabled } = await import('~~/server/utils/changeHistory/config')
const { CLIENT_CHANGE_HISTORY_DEFAULTS } = await import('~~/shared/changeHistoryDefaults')
const { evaluateStaffToolAdmission, MCP_STAFF_TOOL_POLICY } = await import('~~/server/utils/ai/mcp/marketingPolicy')
const { scoreTools } = await import('~~/server/utils/ai/toolRouting')
const { registry } = await import('~~/server/utils/ai/tools/index')

const COVERED = '3b095707-1e86-454a-9280-a504c1ccddc5'
const NOT_COVERED = 'b6d459d4-aeaa-4c78-9868-e6682a0dbc68'
const STAFF = '672c741f-646c-494e-947b-39143a2a0453'

function scope(overrides: Partial<MarketingReadScope> = {}): MarketingReadScope {
  return Object.freeze({
    actorUserId: STAFF,
    clientIds: [COVERED],
    activeClientsOnly: false,
    ownerVerified: false,
    permissionGroups: [],
    reportingGranted: true,
    financialReadAllowed: false,
    ownerRefreshAllowed: false,
    ...overrides
  }) as MarketingReadScope
}

const emptyPage = (clientId: string) => ({ entries: [], nextCursor: null, more: false, appliedLimit: 25, origins: [] as any[], clientId })

beforeEach(() => {
  vi.clearAllMocks()
  // requireScopedClient: `SELECT c.id FROM agency_clients c WHERE c.id = $1 AND c.id = ANY($2)` emulation.
  mockQueryOneFresh.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM agency_clients c WHERE c.id = $1')) {
      const allowed = Array.isArray(params[1]) ? (params[1] as string[]).includes(params[0] as string) : sql.includes('$1 AND TRUE')
      return allowed ? { id: params[0] } : null
    }
    if (sql.includes('SELECT name FROM agency_clients')) return { name: 'Astoria GWM' }
    return null
  })
})

describe('client-scope enforcement', () => {
  it('staff with reporting read a client they cover', async () => {
    const history = vi.fn(async (query: any) => emptyPage(query.clientId))
    const page = await readScopedClientChangeHistory(scope(), { clientId: COVERED }, {
      requireClient: (await import('~~/server/utils/ai/marketing/readScope')).requireScopedClient,
      clientName: async () => 'Astoria GWM',
      history: history as any
    })
    expect(page.client).toEqual({ id: COVERED, name: 'Astoria GWM' })
    expect(history).toHaveBeenCalledOnce()
  })

  it('staff get 404 (never the data) for a client they do not cover', async () => {
    const history = vi.fn()
    await expect(readScopedClientChangeHistory(scope(), { clientId: NOT_COVERED }, {
      requireClient: (await import('~~/server/utils/ai/marketing/readScope')).requireScopedClient,
      clientName: async () => null,
      history
    })).rejects.toMatchObject({ statusCode: 404 })
    expect(history).not.toHaveBeenCalled()
  })

  it('staff with no client assignments see nothing', async () => {
    const history = vi.fn()
    await expect(readScopedClientChangeHistory(scope({ clientIds: [] }), { clientId: COVERED }, {
      requireClient: (await import('~~/server/utils/ai/marketing/readScope')).requireScopedClient,
      clientName: async () => null,
      history
    })).rejects.toMatchObject({ statusCode: 404 })
    expect(history).not.toHaveBeenCalled()
  })

  it('staff without a client-reading permission or reporting grant are refused (403)', async () => {
    const history = vi.fn()
    await expect(readScopedClientChangeHistory(scope({ reportingGranted: false, permissionGroups: ['FINANCE'] }), { clientId: COVERED }, {
      requireClient: async () => {},
      clientName: async () => null,
      history
    })).rejects.toMatchObject({ statusCode: 403 })
    expect(history).not.toHaveBeenCalled()
  })

  it('verified owner (God mode) reads any client', async () => {
    const history = vi.fn(async (query: any) => emptyPage(query.clientId))
    await readScopedClientChangeHistory(scope({ ownerVerified: true, clientIds: null, reportingGranted: false }), { clientId: NOT_COVERED }, {
      requireClient: (await import('~~/server/utils/ai/marketing/readScope')).requireScopedClient,
      clientName: async () => null,
      history: history as any
    })
    expect(history).toHaveBeenCalledOnce()
  })

  it('name resolution only searches inside the caller\'s scope', async () => {
    mockQueryRowsFresh.mockResolvedValueOnce([{ id: COVERED, name: 'Astoria GWM' }])
    await expect(resolveScopedClientByName(scope(), 'Astoria')).resolves.toEqual({ id: COVERED, name: 'Astoria GWM' })
    const [sql, params] = mockQueryRowsFresh.mock.calls[0]!
    expect(sql).toContain('c.id = ANY($3::uuid[])')
    expect(params).toEqual(['%Astoria%', 'Astoria', [COVERED]])
    await expect(resolveScopedClientByName(scope({ clientIds: [] }), 'Astoria')).resolves.toBeNull()
  })
})

describe('get_client_change_history tool', () => {
  const ctx = { userId: STAFF, userRole: 'media_buyer', source: 'mcp', event: {} } as any

  it('is dormant: returns CHANGE_HISTORY_DISABLED without resolving authority or reading', async () => {
    const deps = { enabled: () => false, scope: vi.fn(), resolveName: vi.fn(), read: vi.fn() }
    const result = await getClientChangeHistoryTool({ clientId: COVERED, limit: 25 }, ctx, deps as any)
    expect(result).toMatchObject({ ok: false, code: 'CHANGE_HISTORY_DISABLED' })
    expect(deps.scope).not.toHaveBeenCalled()
    expect(deps.read).not.toHaveBeenCalled()
  })

  it('the committed switch ships off and only an exact local "true" enables it', () => {
    expect(CLIENT_CHANGE_HISTORY_DEFAULTS.enabled).toBe(false)
    expect(clientChangeHistoryEnabled({ processEnv: {} })).toBe(false)
    expect(clientChangeHistoryEnabled({ processEnv: { CLIENT_CHANGE_HISTORY_ENABLED: '1' } })).toBe(false)
    expect(clientChangeHistoryEnabled({ processEnv: { CLIENT_CHANGE_HISTORY_ENABLED: 'true' } })).toBe(true)
    expect(clientChangeHistoryEnabled({ defaults: { enabled: true }, processEnv: {} })).toBe(true)
  })

  it('when enabled: resolves the client name in scope and returns name-only actors', async () => {
    const read = vi.fn(async () => ({
      client: { id: COVERED, name: 'Astoria GWM' },
      entries: [{ id: 'budget:x', at: '2026-08-22T12:50:44.856971Z', origin: 'budget_audit_log', source: 'ui', clientId: COVERED, account: null,
        actor: { userId: STAFF, name: 'Garrix Lopena', type: 'user' }, actionFamily: 'budget', toolName: null, risk: null, status: 'executed',
        rawStatus: null, summary: 'Budget', before: { budget: 0 }, after: { budget: 1 }, approver: null, providerRequestId: null,
        triggerRef: null, rollbackRef: null, resultRef: null, verification: null, updatedAt: null }],
      nextCursor: null, more: false, appliedLimit: 25, origins: ['budget_audit_log']
    }))
    const resolveName = vi.fn(async () => ({ id: COVERED, name: 'Astoria GWM' }))
    const result = await getClientChangeHistoryTool({ clientName: 'Astoria', limit: 25 }, ctx, {
      enabled: () => true, scope: async () => scope(), resolveName, read: read as any
    }) as any
    expect(result.ok).toBe(true)
    expect(read).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ clientId: COVERED, limit: 25 }))
    expect(result.data).toMatchObject({ immutable: true, order: 'newest_first', client: { id: COVERED } })
    expect(result.data.entries[0].actor).toEqual({ userId: STAFF, name: 'Garrix Lopena', type: 'user' })
    expect(JSON.stringify(result.data)).not.toContain('@')
  })

  it('maps an out-of-scope client to CLIENT_NOT_FOUND', async () => {
    const result = await getClientChangeHistoryTool({ clientId: NOT_COVERED, limit: 25 }, ctx, {
      enabled: () => true,
      scope: async () => scope(),
      resolveName: vi.fn(),
      read: async () => { throw Object.assign(new Error('Client not found'), { statusCode: 404 }) }
    })
    expect(result).toMatchObject({ ok: false, code: 'CLIENT_NOT_FOUND' })
  })

  it('is a read-only MEDIA_BUYING registry tool requiring a client', () => {
    expect(clientChangeHistoryTool.mutates).toBeFalsy()
    expect(clientChangeHistoryTool.requiredPermission).toBe('MEDIA_BUYING')
    expect(clientChangeHistoryTool.parameters.safeParse({}).success).toBe(false)
    expect(clientChangeHistoryTool.parameters.safeParse({ clientId: COVERED }).success).toBe(true)
    expect(registry.some(tool => tool.name === 'get_client_change_history')).toBe(true)
  })
})

describe('MCP staff admission', () => {
  const base = {
    userId: STAFF, userRole: 'media_buyer', source: 'mcp', event: {}, mcpStaffAuthority: 'fresh', permissionGroups: ['MEDIA_BUYING'],
    mcpScopes: ['mcp:read'], assistantScope: { clientAccessMode: 'assigned', assignedClientIds: [COVERED] }
  } as any

  it('is a reviewed, client-scoped reporting tool', () => {
    expect(MCP_STAFF_TOOL_POLICY.get_client_change_history).toMatchObject({ capability: 'reporting', status: 'reviewed', clientScoped: true })
  })

  it('admits staff with the reporting grant and a current assignment', () => {
    expect(evaluateStaffToolAdmission('get_client_change_history', { ...base, marketingCapabilities: ['reporting'] }).allowed).toBe(true)
  })

  it('denies staff without the reporting grant or without assignments', () => {
    expect(evaluateStaffToolAdmission('get_client_change_history', { ...base, marketingCapabilities: [] })).toMatchObject({ allowed: false, code: 'capability_required' })
    expect(evaluateStaffToolAdmission('get_client_change_history', {
      ...base, marketingCapabilities: ['reporting'], assistantScope: { clientAccessMode: 'assigned', assignedClientIds: [] }
    })).toMatchObject({ allowed: false, code: 'no_client_assignments' })
  })
})

describe('chat routing vocabulary', () => {
  it('routes "what changed / change log / history / audit" questions to the timeline tool', () => {
    const tools = registry.map(tool => ({ name: tool.name, description: tool.description }))
    for (const text of ['what changed on Astoria GWM last week', 'show the change log for Knox', 'budget history for this client', 'audit trail for Knox GWM']) {
      const ranked = [...scoreTools(tools, text).entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
      expect(ranked.slice(0, 5)).toContain('get_client_change_history')
    }
  })
})
