import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRouteAgentRequest = vi.fn()

vi.mock('@cloudflare/think', () => ({
  Think: class {
    env: any

    constructor(_ctx: unknown, env: any) {
      this.env = env
    }
  },
}))

vi.mock('agents', () => ({
  routeAgentRequest: (...args: unknown[]) => mockRouteAgentRequest(...args),
}))

vi.mock('workers-ai-provider', () => ({
  createWorkersAI: () => () => ({}),
}))

describe('platform-agents worker', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRouteAgentRequest.mockReset()
    mockRouteAgentRequest.mockResolvedValue(null)
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
      ]),
      bridges: expect.arrayContaining([
        expect.objectContaining({ path: '/tools/spend-controller/ask', mode: 'read_only' }),
        expect.objectContaining({ path: '/tools/publishing-planner/ask', mode: 'read_only_or_draft_only' }),
        expect.objectContaining({ path: '/tools/financial-watch/ask', mode: 'read_only' }),
      ]),
    })
    expect(mockRouteAgentRequest).not.toHaveBeenCalled()
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
        headers: expect.objectContaining({ authorization: 'Bearer secret-key' }),
      })
    )
    fetchSpy.mockRestore()
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
})
