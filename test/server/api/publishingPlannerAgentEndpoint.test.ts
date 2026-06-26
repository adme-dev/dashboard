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

describe('Publishing Planner Agent endpoints', () => {
  const oldEnv = { ...process.env }

  beforeEach(() => {
    process.env = {
      ...oldEnv,
      PUBLISHING_PLANNER_AGENT_ENABLED: 'true',
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
    mockQueryRows
      .mockResolvedValueOnce([{ key: 'draft', count: '3' }, { key: 'scheduled', count: '2' }])
      .mockResolvedValueOnce([{ key: 'facebook', count: '1' }, { key: 'instagram', count: '1' }])
      .mockResolvedValueOnce([{ key: 'active', count: '1' }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([{ total_count: '2', enabled_count: '1' }])
      .mockResolvedValueOnce([{ active_count: '2', error_count: '0' }])
      .mockResolvedValueOnce([{
        id: 'post-1',
        status: 'scheduled',
        scheduled_at: '2026-06-30T00:00:00.000Z',
        platforms: ['facebook'],
        content: 'Next scheduled post content',
      }])
  })

  it('requires auth, reads planner data, and records a platform-agent run', async () => {
    const handler = (await import('~~/server/api/agency/agents/publishing-planner/ask.post')).default

    const result = await handler({
      body: {
        prompt: 'Review the planner.',
        context: { clientId: 'client-1' },
      },
    } as any)

    expect(mockRequireAuth).toHaveBeenCalled()
    expect(mockQueryRows).toHaveBeenCalledTimes(7)
    expect(mockStartRun).toHaveBeenCalledWith(expect.objectContaining({
      agentType: 'publishing_planner',
      featureKey: 'agent_publishing_planner',
      mode: 'read_only',
      clientId: 'client-1',
      route: '/agency/social/publishing/planner',
    }))
    expect(mockCompleteRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      toolCallCount: 7,
      findingCount: 1,
      proposedActionCount: 0,
    }))
    expect(result).toMatchObject({
      runId: 'run-1',
      mode: 'read_only',
      summary: {
        clientId: 'client-1',
        postsByStatus: { draft: 3, scheduled: 2 },
        queueCount: 0,
        enabledSlots: 1,
      },
      proposedActions: [],
    })
    expect(result.answer).toContain('2 approved/scheduled')
    expect(result.findings[0].title).toContain('Drafts are not in the queue')
  })

  it('allows the internal bridge with INTERNAL_API_KEY and blocks draft mode', async () => {
    const handler = (await import('~~/server/api/internal/platform-agents/publishing-planner/ask.post')).default

    const result = await handler({
      headers: { authorization: 'Bearer secret-key' },
      body: { prompt: 'Review planner.', context: { clientId: 'client-1' } },
    } as any)

    expect(result.mode).toBe('read_only')
    expect(mockRequireAuth).not.toHaveBeenCalled()

    await expect(handler({
      headers: { authorization: 'Bearer secret-key' },
      body: { prompt: 'Draft plan.', draftActions: true, context: { clientId: 'client-1' } },
    } as any)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects disabled or unscoped requests', async () => {
    process.env = { ...oldEnv, PUBLISHING_PLANNER_AGENT_ENABLED: 'false' }
    vi.resetModules()
    const handler = (await import('~~/server/api/agency/agents/publishing-planner/ask.post')).default

    await expect(handler({ body: { prompt: 'Review planner.', context: { clientId: 'client-1' } } } as any))
      .rejects.toMatchObject({ statusCode: 404 })

    process.env = { ...oldEnv, PUBLISHING_PLANNER_AGENT_ENABLED: 'true' }
    vi.resetModules()
    const enabledHandler = (await import('~~/server/api/agency/agents/publishing-planner/ask.post')).default
    await expect(enabledHandler({ body: { prompt: 'Review planner.', context: {} } } as any))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})
