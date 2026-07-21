/* eslint-disable @typescript-eslint/no-explicit-any -- Nuxt auto-import handler shims use minimal test events. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyPlatformAgentScopeAssertion } from '~~/shared/utils/platformAgentScopeAssertion'

const mockResolveUserPlatformAgentAuthority = vi.fn()
const mockResolvePlatformAgentScope = vi.fn()
const mockBeginPlatformAgentThinkTurn = vi.fn()
const mockCompletePlatformAgentThinkTurn = vi.fn()
const mockFailPlatformAgentThinkTurn = vi.fn()
const mockDenyPlatformAgentThinkTurn = vi.fn()
const mockConsumePlatformAgentTurnBudget = vi.fn()

vi.mock('~~/server/utils/ai/platformAgentAuthority', () => ({
  resolveUserPlatformAgentAuthority: (...args: unknown[]) => mockResolveUserPlatformAgentAuthority(...args)
}))

vi.mock('~~/server/utils/ai/platformAgentScope', async (importOriginal) => {
  const original = await importOriginal<typeof import('~~/server/utils/ai/platformAgentScope')>()
  return {
    ...original,
    resolvePlatformAgentScope: (...args: unknown[]) => mockResolvePlatformAgentScope(...args)
  }
})

vi.mock('~~/server/utils/ai/platformAgentThinkTelemetry', () => ({
  beginPlatformAgentThinkTurn: (...args: unknown[]) => mockBeginPlatformAgentThinkTurn(...args),
  completePlatformAgentThinkTurn: (...args: unknown[]) => mockCompletePlatformAgentThinkTurn(...args),
  failPlatformAgentThinkTurn: (...args: unknown[]) => mockFailPlatformAgentThinkTurn(...args),
  denyPlatformAgentThinkTurn: (...args: unknown[]) => mockDenyPlatformAgentThinkTurn(...args)
}))

vi.mock('~~/server/utils/ai/platformAgentTurnBudget', () => ({
  consumePlatformAgentTurnBudget: (...args: unknown[]) => mockConsumePlatformAgentTurnBudget(...args),
  platformAgentTurnBudgetLimitsFromEnv: () => ({
    maxTurnsPerUser: 10,
    maxTurnsGlobal: 50,
    windowSeconds: 86_400
  })
}))

;(globalThis as any).defineEventHandler = (fn: any) => fn
;(globalThis as any).readBody = (event: any) => event.body || {}
;(globalThis as any).setHeader = (event: any, name: string, value: string) => {
  event.responseHeaders ||= {}
  event.responseHeaders[name.toLowerCase()] = value
}
;(globalThis as any).createError = (input: any) => Object.assign(new Error(input.statusMessage || 'error'), input)

describe('POST /api/agency/agents/think/turn', () => {
  const oldEnv = { ...process.env }
  const signingSecret = 'platform-agent-scope-test-secret-at-least-32-bytes'

  beforeEach(() => {
    process.env = {
      ...oldEnv,
      PLATFORM_AGENT_THINK_TURNS_ENABLED: 'true',
      PLATFORM_AGENT_SCOPE_SIGNING_SECRET: signingSecret,
      PLATFORM_AGENT_WORKER_URL: 'https://platform-agents.example.workers.dev'
    }
    vi.resetModules()
    vi.restoreAllMocks()
    mockResolveUserPlatformAgentAuthority.mockReset()
    mockResolvePlatformAgentScope.mockReset()
    mockBeginPlatformAgentThinkTurn.mockReset()
    mockCompletePlatformAgentThinkTurn.mockReset()
    mockFailPlatformAgentThinkTurn.mockReset()
    mockDenyPlatformAgentThinkTurn.mockReset()
    mockConsumePlatformAgentTurnBudget.mockReset()
    mockBeginPlatformAgentThinkTurn.mockResolvedValue({
      runId: '11111111-1111-4111-8111-111111111111',
      startedAtMs: 100,
      agent: 'spend-controller',
      featureKey: 'agent_spend_controller',
      correlationId: 'correlation-123',
      userId: 'user-123',
      clientId: 'client-123',
      tenantId: null
    })
    mockCompletePlatformAgentThinkTurn.mockResolvedValue(undefined)
    mockFailPlatformAgentThinkTurn.mockResolvedValue(undefined)
    mockDenyPlatformAgentThinkTurn.mockResolvedValue(undefined)
    mockConsumePlatformAgentTurnBudget.mockResolvedValue({
      allowed: true,
      userRemaining: 9,
      globalRemaining: 49,
      resetAt: '2026-07-23T00:00:00.000Z'
    })
    mockResolveUserPlatformAgentAuthority.mockResolvedValue({
      actor: { type: 'user', id: 'user-123' },
      tenantId: null,
      allowedClientIds: ['client-123'],
      permissions: ['MEDIA_BUYING'],
      correlationId: 'correlation-123',
      source: 'authenticated_app'
    })
    mockResolvePlatformAgentScope.mockReturnValue({
      actor: { type: 'user', id: 'user-123' },
      tenantId: null,
      client: { kind: 'single', clientId: 'client-123' },
      permissions: ['MEDIA_BUYING'],
      correlationId: 'correlation-123',
      source: 'authenticated_app'
    })
  })

  it('stays fail-closed without the coordinated app feature flag', async () => {
    process.env.PLATFORM_AGENT_THINK_TURNS_ENABLED = 'false'
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const handler = (await import('~~/server/api/agency/agents/think/turn.post')).default

    await expect(handler({ body: {} } as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockResolveUserPlatformAgentAuthority).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('derives user scope, signs server-side, and proxies only prompt plus bearer assertion to the bound instance', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      requestId: 'request-123',
      status: 'completed',
      text: 'Governed answer.',
      telemetry: {
        provider: 'cloudflare-workers-ai',
        modelId: '@cf/moonshotai/kimi-k2.7-code',
        stepCount: 2,
        toolCallCount: 1,
        toolFailureCount: 0,
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        cachedInputTokens: 10,
        reasoningTokens: 0,
        finishReason: 'stop',
        failureStage: null,
        recoveryExhausted: false,
        durationMs: 450
      }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))
    const event = {
      body: {
        agent: 'spend-controller',
        prompt: 'Review this month’s spend.',
        context: { clientId: 'client-123' }
      }
    } as any
    const handler = (await import('~~/server/api/agency/agents/think/turn.post')).default

    const result = await handler(event)

    expect(mockResolveUserPlatformAgentAuthority).toHaveBeenCalledWith(event, {
      permissionGroups: ['MEDIA_BUYING'],
      tenant: 'none'
    })
    expect(mockResolvePlatformAgentScope).toHaveBeenCalledWith(
      expect.objectContaining({ actor: { type: 'user', id: 'user-123' } }),
      {
        requestedTenantId: null,
        requestedClientId: 'client-123',
        clientSelection: 'all_allowed'
      }
    )
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toMatch(/^https:\/\/platform-agents\.example\.workers\.dev\/v1\/turns\/spend-controller\/pa_[A-Za-z0-9_-]{32}$/)
    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ prompt: 'Review this month’s spend.' })
    })
    const authorization = new Headers(init?.headers).get('authorization')
    expect(authorization).toMatch(/^Bearer pasa1\./)
    const token = authorization!.slice('Bearer '.length)
    const instanceId = decodeURIComponent(String(url).split('/').at(-1)!)
    await expect(verifyPlatformAgentScopeAssertion({
      token,
      secret: signingSecret,
      expectedAgent: 'spend-controller',
      expectedInstanceId: instanceId
    })).resolves.toMatchObject({
      subject: 'user-123',
      clientIds: ['client-123'],
      permissions: ['MEDIA_BUYING']
    })
    expect(result).toEqual({
      requestId: 'request-123',
      status: 'completed',
      text: 'Governed answer.'
    })
    expect(mockBeginPlatformAgentThinkTurn).toHaveBeenCalledWith({
      agent: 'spend-controller',
      correlationId: 'correlation-123',
      userId: 'user-123',
      clientId: 'client-123',
      tenantId: null
    })
    expect(mockCompletePlatformAgentThinkTurn).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'correlation-123' }),
      expect.objectContaining({
        requestId: 'request-123',
        modelId: '@cf/moonshotai/kimi-k2.7-code',
        totalTokens: 120
      })
    )
    expect(mockFailPlatformAgentThinkTurn).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain(token)
    expect(JSON.stringify(result)).not.toContain('telemetry')
    expect(event.responseHeaders).toEqual({ 'cache-control': 'no-store' })
  })

  it.each([
    ['publishing-planner', ['CLIENTS', 'MEDIA_BUYING', 'CREATIVE'], 'none', undefined, 'required'],
    ['financial-watch', ['FINANCE'], 'required', 'all', 'all_allowed'],
    ['traffic-controller', ['ADMIN'], 'none', undefined, 'all_allowed']
  ] as const)('uses the closed department authority policy for %s', async (
    agent,
    permissionGroups,
    tenant,
    clientAccess,
    clientSelection
  ) => {
    mockResolveUserPlatformAgentAuthority.mockResolvedValue({
      actor: { type: 'user', id: 'user-123' },
      tenantId: tenant === 'required' ? 'tenant-123' : null,
      allowedClientIds: ['client-123'],
      permissions: [permissionGroups[0]],
      correlationId: 'correlation-123',
      source: 'authenticated_app'
    })
    mockResolvePlatformAgentScope.mockReturnValue({
      actor: { type: 'user', id: 'user-123' },
      tenantId: tenant === 'required' ? 'tenant-123' : null,
      client: { kind: 'single', clientId: 'client-123' },
      permissions: [permissionGroups[0]],
      correlationId: 'correlation-123',
      source: 'authenticated_app'
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'completed',
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
        durationMs: 25
      }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }))
    const event = {
      body: {
        agent,
        prompt: 'Review.',
        context: { tenantId: 'tenant-123', clientId: 'client-123' }
      }
    } as any
    const handler = (await import('~~/server/api/agency/agents/think/turn.post')).default

    await handler(event)

    expect(mockResolveUserPlatformAgentAuthority).toHaveBeenCalledWith(event, {
      permissionGroups: [...permissionGroups],
      tenant,
      ...(clientAccess ? { clientAccess } : {})
    })
    expect(mockResolvePlatformAgentScope).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      clientSelection
    }))
  })

  it('rejects invalid agent, prompt, signing configuration, and non-HTTPS Worker origins before fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const handler = (await import('~~/server/api/agency/agents/think/turn.post')).default

    await expect(handler({ body: { agent: 'unknown', prompt: 'Review.' } } as any)).rejects.toMatchObject({ statusCode: 400 })
    await expect(handler({ body: { agent: 'spend-controller', prompt: 'x'.repeat(8_001) } } as any)).rejects.toMatchObject({ statusCode: 400 })
    process.env.PLATFORM_AGENT_SCOPE_SIGNING_SECRET = ''
    await expect(handler({ body: { agent: 'spend-controller', prompt: 'Review.' } } as any)).rejects.toMatchObject({ statusCode: 503 })
    process.env.PLATFORM_AGENT_SCOPE_SIGNING_SECRET = signingSecret
    process.env.PLATFORM_AGENT_WORKER_URL = 'http://platform-agents.internal'
    await expect(handler({ body: { agent: 'spend-controller', prompt: 'Review.' } } as any)).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not relay upstream error bodies or oversized responses', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('upstream secret diagnostic', { status: 502 }))
      .mockResolvedValueOnce(new Response('x'.repeat(65_537), { status: 200 }))
    const handler = (await import('~~/server/api/agency/agents/think/turn.post')).default
    const event = { body: { agent: 'spend-controller', prompt: 'Review.' } } as any

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Platform agent turn failed'
    })
    expect(mockFailPlatformAgentThinkTurn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ correlationId: 'correlation-123' }),
      expect.objectContaining({ code: 'worker_http_error' })
    )
    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Platform agent response was invalid'
    })
    expect(mockFailPlatformAgentThinkTurn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ correlationId: 'correlation-123' }),
      expect.objectContaining({ code: 'worker_invalid_response' })
    )
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('stops before the Worker and records an admission denial when a daily turn ceiling is reached', async () => {
    mockConsumePlatformAgentTurnBudget.mockResolvedValue({
      allowed: false,
      code: 'user_daily_turn_limit',
      retryAfterSeconds: 3_600,
      resetAt: '2026-07-22T01:00:00.000Z'
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const event = { body: { agent: 'spend-controller', prompt: 'Review.' } } as any
    const handler = (await import('~~/server/api/agency/agents/think/turn.post')).default

    await expect(handler(event)).rejects.toMatchObject({
      statusCode: 429,
      statusMessage: 'Platform agent daily turn limit reached'
    })
    expect(event.responseHeaders['retry-after']).toBe('3600')
    expect(mockDenyPlatformAgentThinkTurn).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'correlation-123' }),
      expect.objectContaining({
        code: 'user_daily_turn_limit',
        retryAfterSeconds: 3_600,
        resetAt: '2026-07-22T01:00:00.000Z'
      })
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails closed before the Worker when the daily budget store is unavailable', async () => {
    mockConsumePlatformAgentTurnBudget.mockResolvedValue({
      allowed: false,
      code: 'budget_unavailable',
      retryAfterSeconds: 60
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const handler = (await import('~~/server/api/agency/agents/think/turn.post')).default

    await expect(handler({ body: { agent: 'spend-controller', prompt: 'Review.' } } as any)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Platform agent budget is unavailable'
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('preserves the admission response when denial telemetry is unavailable', async () => {
    mockConsumePlatformAgentTurnBudget.mockResolvedValue({
      allowed: false,
      code: 'global_daily_turn_limit',
      retryAfterSeconds: 1_800,
      resetAt: '2026-07-22T00:30:00.000Z'
    })
    mockDenyPlatformAgentThinkTurn.mockRejectedValue(new Error('audit unavailable'))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const handler = (await import('~~/server/api/agency/agents/think/turn.post')).default

    await expect(handler({ body: { agent: 'spend-controller', prompt: 'Review.' } } as any)).rejects.toMatchObject({
      statusCode: 429,
      statusMessage: 'Platform agent daily turn limit reached'
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('turns recovery exhaustion into a stable ledger event and a generic client error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      requestId: 'request-recovery',
      status: 'error',
      telemetry: {
        provider: 'cloudflare-workers-ai',
        modelId: '@cf/moonshotai/kimi-k2.7-code',
        stepCount: 2,
        toolCallCount: 1,
        toolFailureCount: 1,
        promptTokens: 500,
        completionTokens: 20,
        totalTokens: 520,
        cachedInputTokens: 100,
        reasoningTokens: 10,
        finishReason: 'error',
        failureStage: 'recovery',
        recoveryExhausted: true,
        durationMs: 2_500
      }
    }), { status: 200 }))
    const handler = (await import('~~/server/api/agency/agents/think/turn.post')).default

    await expect(handler({
      body: { agent: 'spend-controller', prompt: 'Review.' }
    } as any)).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Platform agent turn failed'
    })

    expect(mockFailPlatformAgentThinkTurn).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'correlation-123' }),
      expect.objectContaining({
        code: 'context_overflow_recovery_exhausted',
        telemetry: expect.objectContaining({
          requestId: 'request-recovery',
          recoveryExhausted: true,
          toolFailureCount: 1
        })
      })
    )
  })
})
