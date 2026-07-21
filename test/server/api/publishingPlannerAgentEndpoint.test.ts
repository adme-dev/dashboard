import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockStartRun = vi.fn()
const mockCompleteRun = vi.fn()
const mockFailRun = vi.fn()
const mockGenerateModelRoutedGroqInsight = vi.fn()
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

vi.mock('~~/server/utils/ai/resolvedGroq', () => ({
  generateModelRoutedGroqInsight: (...args: unknown[]) => mockGenerateModelRoutedGroqInsight(...args),
}))

vi.mock('~~/server/utils/ai/platformAgentAuthority', () => ({
  resolveUserPlatformAgentAuthority: (...args: unknown[]) => mockResolveUserPlatformAgentAuthority(...args),
  resolveServicePlatformAgentAuthority: (...args: unknown[]) => mockResolveServicePlatformAgentAuthority(...args),
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
    mockGenerateModelRoutedGroqInsight.mockReset()
    mockResolveUserPlatformAgentAuthority.mockReset()
    mockResolveServicePlatformAgentAuthority.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
    mockResolveUserPlatformAgentAuthority.mockResolvedValue(Object.freeze({
      actor: Object.freeze({ type: 'user', id: 'user-1' }),
      tenantId: null,
      allowedClientIds: Object.freeze(['client-1']),
      permissions: Object.freeze(['CLIENTS']),
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
    mockGenerateModelRoutedGroqInsight.mockResolvedValue(JSON.stringify({
      posts: [{
        content: 'Draft one',
        variants: { instagram: 'Instagram draft one' },
        hashtags: ['draft'],
      }],
    }))
    mockQueryRows
      .mockResolvedValueOnce([{ client_id: 'client-1', key: 'draft', count: '3' }, { client_id: 'client-1', key: 'scheduled', count: '2' }])
      .mockResolvedValueOnce([{ client_id: 'client-1', key: 'facebook', count: '1' }, { client_id: 'client-1', key: 'instagram', count: '1' }])
      .mockResolvedValueOnce([{ client_id: 'client-1', key: 'active', count: '1' }])
      .mockResolvedValueOnce([{ client_id: 'client-1', count: '0' }])
      .mockResolvedValueOnce([{ client_id: 'client-1', total_count: '2', enabled_count: '1' }])
      .mockResolvedValueOnce([{ client_id: 'client-1', active_count: '2', error_count: '0' }])
      .mockResolvedValueOnce([{
        id: 'post-1',
        client_id: 'client-1',
        status: 'scheduled',
        scheduled_at: '2026-06-30T00:00:00.000Z',
        platforms: ['facebook'],
        content: 'Next scheduled post content',
      }])
  })

  it('rejects a client outside the authenticated authority before planner reads', async () => {
    const handler = (await import('~~/server/api/agency/agents/publishing-planner/ask.post')).default

    await expect(handler({
      body: {
        prompt: 'Review another planner.',
        context: { clientId: 'client-2' },
      },
    } as any)).rejects.toMatchObject({
      code: 'CLIENT_SCOPE_VIOLATION',
      statusCode: 403,
    })
    expect(mockQueryRows).not.toHaveBeenCalled()
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

  it('returns only the authenticated client outcome when planner sources yield mixed rows', async () => {
    mockQueryRows.mockReset()
    mockQueryRows
      .mockResolvedValueOnce([
        { client_id: 'client-1', key: 'draft', count: '1' },
        { client_id: 'client-2', key: 'draft', count: '99' },
      ])
      .mockResolvedValueOnce([
        { client_id: 'client-1', key: 'facebook', count: '1' },
        { client_id: 'client-2', key: 'tenant-b-secret-platform', count: '99' },
      ])
      .mockResolvedValueOnce([
        { client_id: 'client-1', key: 'active', count: '1' },
        { client_id: 'client-2', key: 'tenant-b-secret-campaign', count: '99' },
      ])
      .mockResolvedValueOnce([
        { client_id: 'client-2', count: '99' },
        { client_id: 'client-1', count: '1' },
      ])
      .mockResolvedValueOnce([
        { client_id: 'client-2', total_count: '99', enabled_count: '99' },
        { client_id: 'client-1', total_count: '2', enabled_count: '1' },
      ])
      .mockResolvedValueOnce([
        { client_id: 'client-2', active_count: '99', error_count: '99' },
        { client_id: 'client-1', active_count: '1', error_count: '0' },
      ])
      .mockResolvedValueOnce([
        {
          id: 'post-a',
          client_id: 'client-1',
          status: 'scheduled',
          scheduled_at: '2026-07-22T00:00:00.000Z',
          platforms: ['facebook'],
          content: 'Tenant A scheduled post',
        },
        {
          id: 'post-b',
          client_id: 'client-2',
          status: 'scheduled',
          scheduled_at: '2026-07-22T00:00:00.000Z',
          platforms: ['instagram'],
          content: 'Tenant B secret scheduled post',
        },
      ])

    const handler = (await import('~~/server/api/agency/agents/publishing-planner/ask.post')).default
    const result = await handler({
      body: { prompt: 'Review Tenant A planner.', context: { clientId: 'client-1' } },
    } as any)

    expect(result.summary).toMatchObject({
      clientId: 'client-1',
      postsByStatus: { draft: 1 },
      connectedPlatforms: { facebook: 1 },
      campaignsByStatus: { active: 1 },
      queueCount: 1,
      totalSlots: 2,
      enabledSlots: 1,
      activeAccounts: 1,
      erroredAccounts: 0,
    })
    expect(result.summary.nextScheduled).toHaveLength(1)
    expect(result.summary.nextScheduled[0].id).toBe('post-a')
    expect(JSON.stringify(result)).not.toContain('Tenant B secret')
    expect(JSON.stringify(result)).not.toContain('tenant-b-secret')
  })

  it('allows the internal bridge with INTERNAL_API_KEY and blocks direct write actions', async () => {
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

  it('returns draft-only suggestions without writing posts', async () => {
    const handler = (await import('~~/server/api/internal/platform-agents/publishing-planner/ask.post')).default

    const result = await handler({
      headers: { authorization: 'Bearer secret-key' },
      body: {
        prompt: 'Draft a week of posts.',
        context: {
          clientId: 'client-1',
          draftPlan: true,
          count: 1,
          platforms: ['facebook', 'instagram'],
        },
      },
    } as any)

    expect(mockGenerateModelRoutedGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Create a 1-post social media content plan'), expect.objectContaining({
      featureKey: 'social_publishing_plan',
      clientId: 'client-1',
    }))
    expect(mockCompleteRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      toolCallCount: 8,
      proposedActionCount: 1,
    }))
    expect(mockQueryRows).toHaveBeenCalledTimes(7)
    expect(result).toMatchObject({
      mode: 'draft_only',
      drafts: [{
        content: 'Draft one',
        platforms: ['facebook', 'instagram'],
        platform_overrides: { instagram: { content: 'Instagram draft one' } },
        hashtags: ['draft'],
      }],
      proposedActions: [{
        type: 'create_social_post_draft',
      }],
    })
    expect(result.answer).toContain('did not create, schedule, or publish')
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
