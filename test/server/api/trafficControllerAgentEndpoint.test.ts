import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockStartRun = vi.fn()
const mockCompleteRun = vi.fn()
const mockFailRun = vi.fn()

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
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockStartRun.mockResolvedValue({ ok: true, runId: 'run-1' })
    mockCompleteRun.mockResolvedValue(undefined)
    mockFailRun.mockResolvedValue(undefined)
    mockQueryRows.mockResolvedValue([
      {
        id: 'spend-run',
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
