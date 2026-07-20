import { beforeEach, describe, expect, it, vi } from 'vitest'
import { issuePlatformAgentScopeAssertion } from '~~/shared/utils/platformAgentScopeAssertion'

const mockRouteAgentRequest = vi.fn()
const mockGetAgentByName = vi.fn()
const mockRunGovernedTurn = vi.fn()
const SCOPE_SECRET = 'platform-agent-scope-test-secret-at-least-32-bytes'

vi.mock('@cloudflare/think', () => ({
  Think: class {
    env: any
    name = ''
    activeTurnMetadata: Record<string, unknown> | undefined

    constructor(_ctx: unknown, env: any) {
      this.env = env
    }

    async chat(_input: unknown, callback: any, options: any) {
      this.activeTurnMetadata = options?.metadata
      await callback.onStart({ requestId: 'request-123' })
      await callback.onDone()
    }

    async getMessages() {
      return [{
        id: 'assistant-123',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Governed answer.' }],
      }]
    }
  },
}))

vi.mock('agents', () => ({
  routeAgentRequest: (...args: unknown[]) => mockRouteAgentRequest(...args),
  getAgentByName: (...args: unknown[]) => mockGetAgentByName(...args),
}))

vi.mock('workers-ai-provider', () => ({
  createWorkersAI: () => () => ({}),
}))

async function authorizeTestAgent(
  agent: {
    env: Record<string, unknown>
    name: string
    activeTurnMetadata?: Record<string, unknown>
    beforeTurn: (context: unknown) => Promise<unknown>
  },
  agentKey: 'spend-controller' | 'publishing-planner' | 'financial-watch' | 'traffic-controller',
) {
  agent.env.PLATFORM_AGENT_SCOPE_SIGNING_SECRET = SCOPE_SECRET
  const issued = await issuePlatformAgentScopeAssertion({
    agent: agentKey,
    scope: {
      actor: { type: 'user', id: 'user-123' },
      tenantId: agentKey === 'financial-watch' ? 'tenant-1' : null,
      client: { kind: 'single', clientId: 'client-1' },
      permissions: ['ADMIN', 'CLIENTS', 'CREATIVE', 'FINANCE', 'MEDIA_BUYING'],
      correlationId: 'correlation-123',
      source: 'authenticated_app',
    },
    secret: SCOPE_SECRET,
  })
  agent.name = issued.claims.instanceId
  agent.activeTurnMetadata = { platformAgentScopeAssertion: issued.token }
  await agent.beforeTurn({})
  return issued
}

describe('platform-agents worker', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRouteAgentRequest.mockReset()
    mockRouteAgentRequest.mockResolvedValue(null)
    mockGetAgentByName.mockReset()
    mockRunGovernedTurn.mockReset()
    mockGetAgentByName.mockResolvedValue({ runGovernedTurn: mockRunGovernedTurn })
    mockRunGovernedTurn.mockResolvedValue({
      requestId: 'request-123',
      status: 'completed',
      text: 'Governed answer.',
      telemetry: {
        provider: 'cloudflare-workers-ai',
        modelId: '@cf/moonshotai/kimi-k2.7-code',
        stepCount: 1,
        toolCallCount: 0,
        toolFailureCount: 0,
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        finishReason: 'stop',
        failureStage: null,
        recoveryExhausted: false,
        durationMs: 20,
      },
    })
  })

  it('exposes a health surface with the Spend Controller Think runtime', async () => {
    const { handlePlatformAgentsFetch } = await import('~~/workers/platform-agents/src/index')
    const res = await handlePlatformAgentsFetch(new Request('https://platform-agents.test/health'), {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    } as any)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      worker: 'platform-agents',
      runtime: 'cloudflare-think',
      agents: expect.arrayContaining([
        expect.objectContaining({ className: 'SpendControllerAgent' }),
        expect.objectContaining({ className: 'PublishingPlannerAgent' }),
        expect.objectContaining({ className: 'FinancialWatchAgent' }),
        expect.objectContaining({ className: 'TrafficControllerAgent' }),
      ]),
      bridges: expect.arrayContaining([
        expect.objectContaining({ path: '/tools/spend-controller/ask', mode: 'read_only' }),
        expect.objectContaining({ path: '/tools/publishing-planner/ask', mode: 'read_only_or_draft_only' }),
        expect.objectContaining({ path: '/tools/financial-watch/ask', mode: 'read_only' }),
        expect.objectContaining({ path: '/tools/traffic-controller/ask', mode: 'read_only' }),
      ]),
    })
    expect(mockRouteAgentRequest).not.toHaveBeenCalled()
  })

  it('fails closed before routing an unauthenticated generic Agent request', async () => {
    mockRouteAgentRequest.mockResolvedValue(new Response('routed', { status: 200 }))
    const { handlePlatformAgentsFetch } = await import('~~/workers/platform-agents/src/index')

    const res = await handlePlatformAgentsFetch(
      new Request('https://platform-agents.test/agents/financial-watch-agent/tenant-1'),
      {
        APP_BASE_URL: 'https://app.xeroflow.io',
        INTERNAL_API_KEY: 'secret-key',
      } as any,
    )

    expect(res.status).toBe(404)
    await expect(res.text()).resolves.toBe('Not found')
    expect(mockRouteAgentRequest).not.toHaveBeenCalled()
  })

  it('does not accept the service credential as browser Agent transport authorization', async () => {
    mockRouteAgentRequest.mockResolvedValue(new Response('routed', { status: 200 }))
    const { handlePlatformAgentsFetch } = await import('~~/workers/platform-agents/src/index')

    const res = await handlePlatformAgentsFetch(
      new Request('https://platform-agents.test/agents/spend-controller-agent/agency', {
        headers: { authorization: 'Bearer secret-key' },
      }),
      {
        APP_BASE_URL: 'https://app.xeroflow.io',
        INTERNAL_API_KEY: 'secret-key',
      } as any,
    )

    expect(res.status).toBe(404)
    expect(mockRouteAgentRequest).not.toHaveBeenCalled()
  })

  it('keeps the signed programmatic turn transport dormant unless explicitly enabled', async () => {
    const { handlePlatformAgentsFetch } = await import('~~/workers/platform-agents/src/index')
    const res = await handlePlatformAgentsFetch(new Request(
      'https://platform-agents.test/v1/turns/spend-controller/pa_instance',
      { method: 'POST' },
    ), {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'service-secret',
      PLATFORM_AGENT_SCOPE_SIGNING_SECRET: 'platform-agent-scope-test-secret-at-least-32-bytes',
      THINK_TURNS_ENABLED: 'false',
    } as any)

    expect(res.status).toBe(404)
    expect(mockGetAgentByName).not.toHaveBeenCalled()
  })

  it('routes a valid signed turn only to its assertion-bound Durable Object instance', async () => {
    const { issuePlatformAgentScopeAssertion } = await import('~~/shared/utils/platformAgentScopeAssertion')
    const secret = 'platform-agent-scope-test-secret-at-least-32-bytes'
    const issued = await issuePlatformAgentScopeAssertion({
      agent: 'financial-watch',
      scope: {
        actor: { type: 'user', id: 'user-123' },
        tenantId: 'tenant-123',
        client: { kind: 'single', clientId: 'client-123' },
        permissions: ['FINANCE'],
        correlationId: 'correlation-123',
        source: 'authenticated_app',
      },
      secret,
    })
    const financialNamespace = {} as DurableObjectNamespace
    const { handlePlatformAgentsFetch } = await import('~~/workers/platform-agents/src/index')
    const res = await handlePlatformAgentsFetch(new Request(
      `https://platform-agents.test/v1/turns/financial-watch/${issued.claims.instanceId}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${issued.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ prompt: 'Review current finance risks.' }),
      },
    ), {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'service-secret',
      PLATFORM_AGENT_SCOPE_SIGNING_SECRET: secret,
      THINK_TURNS_ENABLED: 'true',
      FinancialWatchAgent: financialNamespace,
    } as any)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      requestId: 'request-123',
      status: 'completed',
      text: 'Governed answer.',
      telemetry: {
        provider: 'cloudflare-workers-ai',
        modelId: '@cf/moonshotai/kimi-k2.7-code',
        stepCount: 1,
        toolCallCount: 0,
        toolFailureCount: 0,
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        finishReason: 'stop',
        failureStage: null,
        recoveryExhausted: false,
        durationMs: 20,
      },
    })
    expect(mockGetAgentByName).toHaveBeenCalledWith(financialNamespace, issued.claims.instanceId)
    expect(mockRunGovernedTurn).toHaveBeenCalledWith({
      prompt: 'Review current finance risks.',
      scopeAssertion: issued.token,
    })
  })

  it('rejects malformed, service-key, agent-confused, and instance-confused turn credentials', async () => {
    const { issuePlatformAgentScopeAssertion } = await import('~~/shared/utils/platformAgentScopeAssertion')
    const secret = 'platform-agent-scope-test-secret-at-least-32-bytes'
    const issued = await issuePlatformAgentScopeAssertion({
      agent: 'traffic-controller',
      scope: {
        actor: { type: 'user', id: 'user-123' },
        tenantId: null,
        client: { kind: 'allowed_set', clientIds: ['client-123'] },
        permissions: ['ADMIN'],
        correlationId: 'correlation-123',
        source: 'authenticated_app',
      },
      secret,
    })
    const { handlePlatformAgentsFetch } = await import('~~/workers/platform-agents/src/index')
    const env = {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'service-secret',
      PLATFORM_AGENT_SCOPE_SIGNING_SECRET: secret,
      THINK_TURNS_ENABLED: 'true',
      TrafficControllerAgent: {} as DurableObjectNamespace,
      SpendControllerAgent: {} as DurableObjectNamespace,
    } as any
    const attempts = [
      { agent: 'traffic-controller', instance: issued.claims.instanceId, token: 'service-secret' },
      { agent: 'spend-controller', instance: issued.claims.instanceId, token: issued.token },
      { agent: 'traffic-controller', instance: `pa_${'x'.repeat(32)}`, token: issued.token },
      { agent: 'traffic-controller', instance: issued.claims.instanceId, token: `${issued.token}x` },
    ]

    for (const attempt of attempts) {
      const res = await handlePlatformAgentsFetch(new Request(
        `https://platform-agents.test/v1/turns/${attempt.agent}/${attempt.instance}`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${attempt.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ prompt: 'Review traffic.' }),
        },
      ), env)
      expect(res.status).toBe(401)
    }
    expect(mockGetAgentByName).not.toHaveBeenCalled()
  })

  it('rejects invalid turn methods, content types, and prompt sizes before Durable Object dispatch', async () => {
    const { handlePlatformAgentsFetch } = await import('~~/workers/platform-agents/src/index')
    const env = {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'service-secret',
      PLATFORM_AGENT_SCOPE_SIGNING_SECRET: 'platform-agent-scope-test-secret-at-least-32-bytes',
      THINK_TURNS_ENABLED: 'true',
    } as any
    const baseUrl = `https://platform-agents.test/v1/turns/spend-controller/pa_${'x'.repeat(32)}`

    expect((await handlePlatformAgentsFetch(new Request(baseUrl), env)).status).toBe(405)
    expect((await handlePlatformAgentsFetch(new Request(baseUrl, {
      method: 'POST',
      headers: { authorization: 'Bearer invalid' },
      body: 'not-json',
    }), env)).status).toBe(415)
    expect((await handlePlatformAgentsFetch(new Request(baseUrl, {
      method: 'POST',
      headers: {
        authorization: 'Bearer invalid',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'x'.repeat(8_001) }),
    }), env)).status).toBe(400)
    expect(mockGetAgentByName).not.toHaveBeenCalled()
  })

  it.each([
    ['SpendControllerAgent', ['reviewSpendPacing']],
    ['PublishingPlannerAgent', ['reviewPublishingPlan', 'draftPublishingPlan']],
    ['FinancialWatchAgent', ['reviewFinancialWatch']],
    ['TrafficControllerAgent', ['reviewTrafficControl']],
  ])('bounds %s turns and exposes only its domain tools to a verified scoped turn', async (className, activeTools) => {
    const { issuePlatformAgentScopeAssertion } = await import('~~/shared/utils/platformAgentScopeAssertion')
    const module = await import('~~/workers/platform-agents/src/index')
    const AgentClass = module[className as keyof typeof module] as new (ctx: unknown, env: unknown) => {
      chatRecovery: {
        maxAttempts: number
        noProgressTimeoutMs: number
        maxRecoveryWork: number
        maxOomRetries: number
        terminalMessage: string
      }
      maxSteps: number
      sendReasoning: boolean
      chatStreamStallTimeoutMs: number
      name: string
      activeTurnMetadata?: Record<string, unknown>
      beforeTurn: (context: unknown) => Promise<Record<string, unknown>>
    }
    const agentKey = ({
      SpendControllerAgent: 'spend-controller',
      PublishingPlannerAgent: 'publishing-planner',
      FinancialWatchAgent: 'financial-watch',
      TrafficControllerAgent: 'traffic-controller',
    } as const)[className as 'SpendControllerAgent' | 'PublishingPlannerAgent' | 'FinancialWatchAgent' | 'TrafficControllerAgent']
    const secret = 'platform-agent-scope-test-secret-at-least-32-bytes'
    const issued = await issuePlatformAgentScopeAssertion({
      agent: agentKey,
      scope: {
        actor: { type: 'user', id: 'user-123' },
        tenantId: agentKey === 'financial-watch' ? 'tenant-123' : null,
        client: { kind: 'single', clientId: 'client-123' },
        permissions: ['ADMIN', 'CLIENTS', 'CREATIVE', 'FINANCE', 'MEDIA_BUYING'],
        correlationId: 'correlation-123',
        source: 'authenticated_app',
      },
      secret,
    })
    const agent = new AgentClass({}, {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
      PLATFORM_AGENT_SCOPE_SIGNING_SECRET: secret,
    })
    agent.name = issued.claims.instanceId
    agent.activeTurnMetadata = { platformAgentScopeAssertion: issued.token }

    expect(agent.maxSteps).toBe(4)
    expect(agent.sendReasoning).toBe(false)
    expect(agent.chatStreamStallTimeoutMs).toBe(60_000)
    expect(agent.chatRecovery).toMatchObject({
      maxAttempts: 2,
      noProgressTimeoutMs: 60_000,
      maxRecoveryWork: 64,
      maxOomRetries: 1,
      terminalMessage: 'The assistant turn was interrupted. Please try again.',
    })
    const turnConfig = await agent.beforeTurn({})
    expect(turnConfig).toMatchObject({
      activeTools,
      maxSteps: 4,
      maxOutputTokens: 2_048,
      maxRetries: 1,
      sendReasoning: false,
    })
    expect((turnConfig.activeTools as string[])).not.toEqual(expect.arrayContaining([
      'read',
      'write',
      'edit',
      'list',
      'find',
      'grep',
      'delete',
      'bash',
    ]))
    agent.activeTurnMetadata = undefined
    await expect(agent.beforeTurn({})).rejects.toThrow('Unauthorized platform agent turn')
  })

  it('proxies read-only Publishing Planner requests to the internal app endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      mode: 'read_only',
      answer: 'Planner has drafts ready to queue.',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const { handlePlatformAgentsFetch } = await import('~~/workers/platform-agents/src/index')

    const res = await handlePlatformAgentsFetch(new Request('https://platform-agents.test/tools/publishing-planner/ask', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key' },
      body: JSON.stringify({
        prompt: 'Review planner.',
        context: { clientId: 'client-1' },
      }),
    }), {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    } as any)

    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://app.xeroflow.io/api/internal/platform-agents/publishing-planner/ask',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer secret-key',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({
          prompt: 'Review planner.',
          context: { clientId: 'client-1' },
          draftActions: false,
        }),
      })
    )
    await expect(res.json()).resolves.toMatchObject({ mode: 'read_only' })
    fetchSpy.mockRestore()
  })

  it('guards the Spend Controller app bridge with INTERNAL_API_KEY', async () => {
    const { handlePlatformAgentsFetch } = await import('~~/workers/platform-agents/src/index')
    const res = await handlePlatformAgentsFetch(new Request('https://platform-agents.test/tools/spend-controller/ask', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-key' },
      body: JSON.stringify({ prompt: 'Review spend.' }),
    }), {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    } as any)

    expect(res.status).toBe(401)
  })

  it.each([
    { name: 'missing credentials', authorization: undefined, key: 'secret-key', allowed: false },
    { name: 'malformed credentials', authorization: 'secret-key', key: 'secret-key', allowed: false },
    { name: 'incorrect credentials', authorization: 'Bearer wrong-key', key: 'secret-key', allowed: false },
    { name: 'missing server configuration', authorization: 'Bearer secret-key', key: undefined, allowed: false },
    { name: 'matching Bearer credentials', authorization: 'Bearer secret-key', key: 'secret-key', allowed: true },
  ])('verifies service authorization for $name', async ({ authorization, key, allowed }) => {
    const { verifyServiceAuthorization } = await import('~~/workers/platform-agents/src/index')
    const headers = authorization ? { authorization } : undefined
    const request = new Request('https://platform-agents.test/tools/spend-controller/ask', { headers })

    await expect(verifyServiceAuthorization(request, {
      INTERNAL_API_KEY: key,
    } as any)).resolves.toBe(allowed)
  })

  it('proxies read-only Financial Watch requests to the internal app endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      mode: 'read_only',
      answer: 'Financial watch complete.',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const { handlePlatformAgentsFetch } = await import('~~/workers/platform-agents/src/index')

    const res = await handlePlatformAgentsFetch(new Request('https://platform-agents.test/tools/financial-watch/ask', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key' },
      body: JSON.stringify({
        prompt: 'Review finance risk.',
        context: { tenantId: 'tenant-1' },
      }),
    }), {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    } as any)

    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://app.xeroflow.io/api/internal/platform-agents/financial-watch/ask',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer secret-key',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({
          prompt: 'Review finance risk.',
          context: { tenantId: 'tenant-1' },
          draftActions: false,
        }),
      })
    )
    await expect(res.json()).resolves.toMatchObject({ mode: 'read_only' })
    fetchSpy.mockRestore()
  })

  it('proxies read-only Traffic Controller requests to the internal app endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      mode: 'read_only',
      answer: 'Traffic review complete.',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const { handlePlatformAgentsFetch } = await import('~~/workers/platform-agents/src/index')

    const res = await handlePlatformAgentsFetch(new Request('https://platform-agents.test/tools/traffic-controller/ask', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key' },
      body: JSON.stringify({
        prompt: 'Review traffic.',
        context: { clientId: 'client-1' },
      }),
    }), {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    } as any)

    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://app.xeroflow.io/api/internal/platform-agents/traffic-controller/ask',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer secret-key',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({
          prompt: 'Review traffic.',
          context: { clientId: 'client-1' },
          draftActions: false,
        }),
      })
    )
    await expect(res.json()).resolves.toMatchObject({ mode: 'read_only' })
    fetchSpy.mockRestore()
  })

  it('proxies read-only Spend Controller requests to the internal app endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      mode: 'read_only',
      answer: 'Pacing looks stable.',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const { handlePlatformAgentsFetch } = await import('~~/workers/platform-agents/src/index')

    const res = await handlePlatformAgentsFetch(new Request('https://platform-agents.test/tools/spend-controller/ask', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key' },
      body: JSON.stringify({
        prompt: 'Review spend.',
        context: { period: '2026-06', platform: 'meta' },
      }),
    }), {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    } as any)

    expect(res.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://app.xeroflow.io/api/internal/platform-agents/spend-controller/ask',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer secret-key',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({
          prompt: 'Review spend.',
          context: { period: '2026-06', platform: 'meta' },
          draftActions: false,
        }),
      })
    )
    await expect(res.json()).resolves.toMatchObject({ mode: 'read_only' })
    fetchSpy.mockRestore()
  })

  it('exposes a read-only spend pacing tool on the Think agent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      mode: 'read_only',
      findings: [{ title: 'Overpacing campaign' }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const { SpendControllerAgent } = await import('~~/workers/platform-agents/src/index')
    const agent = new SpendControllerAgent({} as any, {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    } as any)
    await authorizeTestAgent(agent as any, 'spend-controller')

    const tools = agent.getTools()
    expect(Object.keys(tools)).toEqual(['reviewSpendPacing'])
    await expect(tools.reviewSpendPacing.execute?.({
      prompt: 'Review spend.',
      period: '2026-06',
      platform: 'meta',
    }, {
      toolCallId: 'tool-1',
      messages: [],
    } as any)).resolves.toMatchObject({
      mode: 'read_only',
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://app.xeroflow.io/api/internal/platform-agents/spend-controller/ask',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer secret-key' }),
      })
    )
    fetchSpy.mockRestore()
  })

  it('exposes a read-only publishing planner tool on the Think agent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      mode: 'read_only',
      answer: 'Planner review complete.',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const { PublishingPlannerAgent } = await import('~~/workers/platform-agents/src/index')
    const agent = new PublishingPlannerAgent({} as any, {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    } as any)
    const issued = await authorizeTestAgent(agent as any, 'publishing-planner')

    const tools = agent.getTools()
    expect(Object.keys(tools)).toEqual(['reviewPublishingPlan', 'draftPublishingPlan'])
    await expect(tools.reviewPublishingPlan.execute?.({
      prompt: 'Review planner.',
      clientId: 'client-1',
    }, {
      toolCallId: 'tool-1',
      messages: [],
    } as any)).resolves.toMatchObject({
      mode: 'read_only',
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://app.xeroflow.io/api/internal/platform-agents/publishing-planner/ask',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer secret-key',
          'x-platform-agent-scope-assertion': issued.token,
        }),
      })
    )
    fetchSpy.mockRestore()
  })

  it.each([
    ['SpendControllerAgent', 'spend-controller', 'reviewSpendPacing', {
      prompt: 'Review spend.',
      clientId: 'client-2',
    }],
    ['PublishingPlannerAgent', 'publishing-planner', 'reviewPublishingPlan', {
      prompt: 'Review planner.',
      clientId: 'client-2',
    }],
    ['FinancialWatchAgent', 'financial-watch', 'reviewFinancialWatch', {
      prompt: 'Review finance.',
      tenantId: 'tenant-2',
      clientId: 'client-1',
    }],
    ['TrafficControllerAgent', 'traffic-controller', 'reviewTrafficControl', {
      prompt: 'Review traffic.',
      clientId: 'client-2',
    }],
  ] as const)('rejects model-requested scope widening in %s before an app bridge call', async (
    className,
    agentKey,
    toolName,
    input,
  ) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const module = await import('~~/workers/platform-agents/src/index')
    const AgentClass = module[className] as new (ctx: unknown, env: unknown) => any
    const agent = new AgentClass({}, {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    })
    await authorizeTestAgent(agent, agentKey)

    await expect(agent.getTools()[toolName].execute(input, {
      toolCallId: 'tool-scope-test',
      messages: [],
    })).rejects.toThrow(/outside the authorized platform agent scope/)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('admits a governed turn through server-only metadata and returns no assertion material', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { SpendControllerAgent } = await import('~~/workers/platform-agents/src/index')
    const agent = new SpendControllerAgent({} as any, {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    } as any)
    const issued = await authorizeTestAgent(agent as any, 'spend-controller')
    agent.onStepFinish({
      stepNumber: 0,
      toolCalls: [{}, {}],
      usage: {
        inputTokens: 100,
        outputTokens: 25,
        totalTokens: 125,
        cachedInputTokens: 10,
        reasoningTokens: 5,
      },
      finishReason: 'stop',
    } as any)

    const result = await agent.runGovernedTurn({
      prompt: 'Review current spend.',
      scopeAssertion: issued.token,
    })

    expect(result).toEqual({
      requestId: 'request-123',
      status: 'completed',
      text: 'Governed answer.',
      telemetry: {
        provider: 'cloudflare-workers-ai',
        modelId: '@cf/moonshotai/kimi-k2.7-code',
        stepCount: 1,
        toolCallCount: 2,
        toolFailureCount: 0,
        promptTokens: 100,
        completionTokens: 25,
        totalTokens: 125,
        cachedInputTokens: 10,
        reasoningTokens: 5,
        finishReason: 'stop',
        failureStage: null,
        recoveryExhausted: false,
        durationMs: expect.any(Number),
      },
    })
    expect(agent.activeTurnMetadata).toEqual({ platformAgentScopeAssertion: issued.token })
    expect(JSON.stringify(result)).not.toContain(issued.token)
    expect(logSpy).toHaveBeenCalledTimes(1)
    const log = JSON.parse(String(logSpy.mock.calls[0]![0]))
    expect(log).toMatchObject({
      event: 'platform_agent_turn',
      correlationId: 'correlation-123',
      agent: 'spend-controller',
      requestId: 'request-123',
      status: 'completed',
      stepCount: 1,
      toolCallCount: 2,
    })
    expect(log.durationMs).toEqual(expect.any(Number))
    expect(JSON.stringify(log)).not.toContain('Review current spend.')
    expect(JSON.stringify(log)).not.toContain(issued.token)
    expect(JSON.stringify(log)).not.toContain('user-123')
    expect(JSON.stringify(log)).not.toContain('client-1')
    logSpy.mockRestore()
  })

  it('surfaces bounded tool-failure and recovery-exhaustion telemetry without raw error details', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const recoveryEventSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }))
    const { FinancialWatchAgent } = await import('~~/workers/platform-agents/src/index')
    const agent = new FinancialWatchAgent({} as any, {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
      THINK_MODEL: '@cf/moonshotai/kimi-k2.7-code',
    } as any)
    const issued = await authorizeTestAgent(agent as any, 'financial-watch')
    agent.afterToolCall({
      success: false,
      error: new Error('provider secret diagnostic'),
      durationMs: 12,
      toolName: 'reviewFinancialWatch',
    } as any)
    await agent.chatRecovery.onExhausted({
      requestId: 'request-recovery',
      recoveryRootRequestId: 'request-root',
      reason: 'max_attempts_exceeded',
      terminalMessage: 'The assistant turn was interrupted. Please try again.',
      partialText: 'sensitive partial response',
    } as any)

    expect(recoveryEventSpy).toHaveBeenCalledWith(
      'https://app.xeroflow.io/api/internal/platform-agents/think/recovery-exhausted',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer secret-key' }),
      }),
    )
    const recoveryBody = JSON.parse(String((recoveryEventSpy.mock.calls[0]?.[1] as RequestInit)?.body))
    expect(recoveryBody).toMatchObject({
      agent: 'financial-watch',
      instanceId: issued.claims.instanceId,
      scopeAssertion: issued.token,
      requestId: 'request-recovery',
      recoveryRootRequestId: 'request-root',
      modelId: '@cf/moonshotai/kimi-k2.7-code',
    })
    expect(JSON.stringify(recoveryBody)).not.toContain('max_attempts_exceeded')
    expect(JSON.stringify(recoveryBody)).not.toContain('sensitive partial response')

    const result = await agent.runGovernedTurn({
      prompt: 'Review financial risk.',
      scopeAssertion: issued.token,
    })

    expect(result).toMatchObject({
      requestId: 'request-123',
      status: 'error',
      telemetry: {
        toolFailureCount: 1,
        failureStage: 'recovery',
        recoveryExhausted: true,
      },
    })
    expect(JSON.stringify(result)).not.toContain('provider secret diagnostic')
    expect(JSON.stringify(result)).not.toContain('max_attempts_exceeded')
    const log = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]))
    expect(log).toMatchObject({
      event: 'platform_agent_turn',
      status: 'error',
      toolFailureCount: 1,
      failureStage: 'recovery',
      recoveryExhausted: true,
    })
    expect(JSON.stringify(log)).not.toContain('provider secret diagnostic')
    expect(JSON.stringify(log)).not.toContain('max_attempts_exceeded')
    logSpy.mockRestore()
  })

  it('exposes a draft-only publishing planner tool on the Think agent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      mode: 'draft_only',
      drafts: [{ content: 'Draft one' }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const { PublishingPlannerAgent } = await import('~~/workers/platform-agents/src/index')
    const agent = new PublishingPlannerAgent({} as any, {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    } as any)
    await authorizeTestAgent(agent as any, 'publishing-planner')

    const tools = agent.getTools()
    await expect(tools.draftPublishingPlan.execute?.({
      prompt: 'Draft launch posts.',
      clientId: 'client-1',
      campaignId: 'campaign-1',
      count: 3,
      platforms: ['facebook', 'instagram'],
    }, {
      toolCallId: 'tool-2',
      messages: [],
    } as any)).resolves.toMatchObject({
      mode: 'draft_only',
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://app.xeroflow.io/api/internal/platform-agents/publishing-planner/ask',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer secret-key' }),
        body: JSON.stringify({
          prompt: 'Draft launch posts.',
          context: {
            clientId: 'client-1',
            campaignId: 'campaign-1',
            count: 3,
            platforms: ['facebook', 'instagram'],
            draftPlan: true,
          },
          draftActions: false,
        }),
      })
    )
    fetchSpy.mockRestore()
  })

  it('exposes a read-only Financial Watch tool on the Think agent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      mode: 'read_only',
      findings: [{ title: 'High-priority recommendation open' }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const { FinancialWatchAgent } = await import('~~/workers/platform-agents/src/index')
    const agent = new FinancialWatchAgent({} as any, {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    } as any)
    await authorizeTestAgent(agent as any, 'financial-watch')

    const tools = agent.getTools()
    expect(Object.keys(tools)).toEqual(['reviewFinancialWatch'])
    await expect(tools.reviewFinancialWatch.execute?.({
      prompt: 'Review finance risk.',
      tenantId: 'tenant-1',
      clientId: 'client-1',
    }, {
      toolCallId: 'tool-3',
      messages: [],
    } as any)).resolves.toMatchObject({
      mode: 'read_only',
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://app.xeroflow.io/api/internal/platform-agents/financial-watch/ask',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer secret-key' }),
        body: JSON.stringify({
          prompt: 'Review finance risk.',
          context: {
            tenantId: 'tenant-1',
            clientId: 'client-1',
          },
          draftActions: false,
        }),
      })
    )
    fetchSpy.mockRestore()
  })

  it('exposes a read-only Traffic Controller tool on the Think agent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      mode: 'read_only',
      recommendations: [{ title: 'Hold expansion' }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const { TrafficControllerAgent } = await import('~~/workers/platform-agents/src/index')
    const agent = new TrafficControllerAgent({} as any, {
      APP_BASE_URL: 'https://app.xeroflow.io',
      INTERNAL_API_KEY: 'secret-key',
    } as any)
    await authorizeTestAgent(agent as any, 'traffic-controller')

    const tools = agent.getTools()
    expect(Object.keys(tools)).toEqual(['reviewTrafficControl'])
    await expect(tools.reviewTrafficControl.execute?.({
      prompt: 'Review traffic.',
      clientId: 'client-1',
    }, {
      toolCallId: 'tool-4',
      messages: [],
    } as any)).resolves.toMatchObject({
      mode: 'read_only',
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://app.xeroflow.io/api/internal/platform-agents/traffic-controller/ask',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer secret-key' }),
        body: JSON.stringify({
          prompt: 'Review traffic.',
          context: {
            clientId: 'client-1',
          },
          draftActions: false,
        }),
      })
    )
    fetchSpy.mockRestore()
  })
})
