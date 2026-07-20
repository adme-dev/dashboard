import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockStartRun = vi.fn()
const mockCompleteRun = vi.fn()
const mockFailRun = vi.fn()
const mockResolveUserPlatformAgentAuthority = vi.fn()
const mockResolveServicePlatformAgentAuthority = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

vi.mock('~~/server/utils/ai/platformAgentRuns', () => ({
  startPlatformAgentRun: (...args: unknown[]) => mockStartRun(...args),
  completePlatformAgentRun: (...args: unknown[]) => mockCompleteRun(...args),
  failPlatformAgentRun: (...args: unknown[]) => mockFailRun(...args),
}))

vi.mock('~~/server/utils/ai/platformAgentAuthority', () => ({
  resolveUserPlatformAgentAuthority: (...args: unknown[]) => mockResolveUserPlatformAgentAuthority(...args),
  resolveServicePlatformAgentAuthority: (...args: unknown[]) => mockResolveServicePlatformAgentAuthority(...args),
}))

;(globalThis as any).defineEventHandler = (fn: any) => fn
;(globalThis as any).readBody = (event: any) => event.body || {}
;(globalThis as any).getHeader = (event: any, name: string) => event.headers?.[name.toLowerCase()] ?? event.headers?.[name]
;(globalThis as any).createError = (input: any) => Object.assign(new Error(input.statusMessage || 'error'), input)

describe('Traffic Controller Agent endpoints', () => {
  const oldEnv = { ...process.env }

  beforeEach(() => {
    process.env = {
      ...oldEnv,
      TRAFFIC_CONTROLLER_AGENT_ENABLED: 'true',
      INTERNAL_API_KEY: 'secret-key',
    }
    vi.resetModules()
    mockRequireAuth.mockReset()
    mockQueryRows.mockReset()
    mockStartRun.mockReset()
    mockCompleteRun.mockReset()
    mockFailRun.mockReset()
    mockResolveUserPlatformAgentAuthority.mockReset()
    mockResolveServicePlatformAgentAuthority.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockResolveUserPlatformAgentAuthority.mockResolvedValue(Object.freeze({
      actor: Object.freeze({ type: 'user', id: 'user-1' }),
      tenantId: null,
      allowedClientIds: Object.freeze(['client-1']),
      permissions: Object.freeze(['ADMIN']),
      correlationId: 'request-1',
      source: 'authenticated_app',
    }))
    mockResolveServicePlatformAgentAuthority.mockResolvedValue(Object.freeze({
      actor: Object.freeze({ type: 'service', id: 'cloudflare-platform-agents' }),
      tenantId: null,
      allowedClientIds: Object.freeze(['client-1']),
      permissions: Object.freeze(['PLATFORM_AGENTS_SERVICE']),
      correlationId: 'request-2',
      source: 'authenticated_service',
    }))
    mockStartRun.mockResolvedValue({ ok: true, runId: 'run-1' })
    mockCompleteRun.mockResolvedValue(undefined)
    mockFailRun.mockResolvedValue(undefined)
    mockQueryRows.mockResolvedValue([
      {
        id: 'spend-run',
        client_id: 'client-1',
        run_type: 'platform_agent_spend_controller',
        status: 'completed',
        checks_performed: 8,
        findings_count: 2,
        summary: { proposedActionCount: 1, blockedActionCount: 1 },
        completed_at: '2026-06-26T00:00:00.000Z',
        created_at: '2026-06-26T00:00:00.000Z',
      },
      {
        id: 'publishing-run',
        client_id: 'client-1',
        run_type: 'platform_agent_publishing_planner',
        status: 'completed',
        checks_performed: 8,
        findings_count: 1,
        summary: { proposedActionCount: 2 },
        completed_at: '2026-06-26T00:00:00.000Z',
        created_at: '2026-06-26T00:00:00.000Z',
      },
      {
        id: 'finance-run',
        client_id: 'client-1',
        run_type: 'platform_agent_financial_watch',
        status: 'completed',
        checks_performed: 3,
        findings_count: 2,
        summary: { severityScore: 5 },
        completed_at: '2026-06-26T00:00:00.000Z',
        created_at: '2026-06-26T00:00:00.000Z',
      },
    ])
  })

  it('rejects a client outside the authenticated authority before signal reads', async () => {
    const handler = (await import('~~/server/api/agency/agents/traffic-controller/ask.post')).default

    await expect(handler({
      body: { prompt: 'Review allocation.', context: { clientId: 'client-2' } },
    } as any)).rejects.toMatchObject({ code: 'CLIENT_SCOPE_VIOLATION', statusCode: 403 })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('requires auth, reads platform signals, and returns allocation recommendations', async () => {
    const handler = (await import('~~/server/api/agency/agents/traffic-controller/ask.post')).default

    const result = await handler({
      body: { prompt: 'Review allocation.', context: { clientId: 'client-1' } },
    } as any)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockQueryRows).toHaveBeenCalledTimes(1)
    expect(mockStartRun).toHaveBeenCalledWith(expect.objectContaining({
      agentType: 'traffic_controller',
      featureKey: 'agent_traffic_controller',
      mode: 'read_only',
      clientId: 'client-1',
    }))
    expect(mockCompleteRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      toolCallCount: 1,
      proposedActionCount: 0,
    }))
    expect(result).toMatchObject({
      mode: 'read_only',
      summary: {
        signalCount: 3,
        missingSignals: [],
        highPriorityCount: 2,
      },
    })
    expect(result.recommendations.map((item: any) => item.area)).toEqual(expect.arrayContaining(['finance', 'paid-media', 'publishing']))
    expect(result.proposedActions).toEqual([])
  })

  it('returns only allowed-client signals when the run ledger yields mixed rows', async () => {
    mockQueryRows.mockResolvedValue([
      {
        id: 'spend-a',
        client_id: 'client-1',
        run_type: 'platform_agent_spend_controller',
        status: 'completed',
        checks_performed: 1,
        findings_count: 1,
        summary: { clientId: 'client-1', proposedActionCount: 1 },
        created_at: '2026-07-21T00:00:00.000Z',
      },
      {
        id: 'finance-b',
        client_id: 'client-2',
        run_type: 'platform_agent_financial_watch',
        status: 'completed',
        checks_performed: 99,
        findings_count: 99,
        summary: { clientId: 'client-2', severityScore: 99, secret: 'Tenant B secret finance signal' },
        created_at: '2026-07-21T00:00:00.000Z',
      },
      {
        id: 'publishing-a',
        client_id: 'client-1',
        run_type: 'platform_agent_publishing_planner',
        status: 'completed',
        checks_performed: 1,
        findings_count: 1,
        summary: { clientId: 'client-1', proposedActionCount: 1 },
        created_at: '2026-07-21T00:00:00.000Z',
      },
    ])

    const handler = (await import('~~/server/api/agency/agents/traffic-controller/ask.post')).default
    const result = await handler({
      body: { prompt: 'Review Tenant A traffic.', context: { clientId: 'client-1' } },
    } as any)

    expect(result.summary).toMatchObject({
      clientId: 'client-1',
      signalCount: 2,
      missingSignals: ['financial_watch'],
    })
    expect(result.signals.map((signal: any) => signal.id)).toEqual(['spend-a', 'publishing-a'])
    expect(JSON.stringify(result)).not.toContain('Tenant B secret')
    expect(result.recommendations.map((item: any) => item.area)).not.toContain('finance')
  })

  it('allows the internal bridge with INTERNAL_API_KEY and blocks direct write actions', async () => {
    const handler = (await import('~~/server/api/internal/platform-agents/traffic-controller/ask.post')).default

    const result = await handler({
      headers: { authorization: 'Bearer secret-key' },
      body: { prompt: 'Review allocation.', context: { clientId: 'client-1' } },
    } as any)

    expect(result.mode).toBe('read_only')
    expect(mockRequireAuth).not.toHaveBeenCalled()

    await expect(handler({
      headers: { authorization: 'Bearer secret-key' },
      body: { prompt: 'Write allocation.', draftActions: true, context: { clientId: 'client-1' } },
    } as any)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects disabled requests', async () => {
    process.env = { ...oldEnv, TRAFFIC_CONTROLLER_AGENT_ENABLED: 'false' }
    vi.resetModules()
    const handler = (await import('~~/server/api/agency/agents/traffic-controller/ask.post')).default

    await expect(handler({ body: { prompt: 'Review allocation.' } } as any))
      .rejects.toMatchObject({ statusCode: 404 })
  })
})
