/* eslint-disable @typescript-eslint/no-explicit-any -- Nuxt auto-import handler shims use minimal test events. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { issuePlatformAgentScopeAssertion } from '~~/shared/utils/platformAgentScopeAssertion'

const mockRequirePlatformAgentServiceAuth = vi.fn()
const mockBeginPlatformAgentThinkTurn = vi.fn()
const mockFailPlatformAgentThinkTurn = vi.fn()

vi.mock('~~/server/utils/ai/platformAgentServiceAuth', () => ({
  requirePlatformAgentServiceAuth: (...args: unknown[]) => mockRequirePlatformAgentServiceAuth(...args)
}))

vi.mock('~~/server/utils/ai/platformAgentThinkTelemetry', () => ({
  beginPlatformAgentThinkTurn: (...args: unknown[]) => mockBeginPlatformAgentThinkTurn(...args),
  failPlatformAgentThinkTurn: (...args: unknown[]) => mockFailPlatformAgentThinkTurn(...args)
}))

;(globalThis as any).defineEventHandler = (fn: any) => fn
;(globalThis as any).readBody = (event: any) => event.body || {}
;(globalThis as any).setHeader = (event: any, name: string, value: string) => {
  event.responseHeaders ||= {}
  event.responseHeaders[name.toLowerCase()] = value
}
;(globalThis as any).setResponseStatus = (event: any, status: number) => {
  event.responseStatus = status
}
;(globalThis as any).createError = (input: any) => Object.assign(new Error(input.statusMessage || 'error'), input)

describe('POST /api/internal/platform-agents/think/recovery-exhausted', () => {
  const oldEnv = { ...process.env }
  const signingSecret = 'platform-agent-scope-test-secret-at-least-32-bytes'

  beforeEach(() => {
    process.env = {
      ...oldEnv,
      PLATFORM_AGENT_SCOPE_SIGNING_SECRET: signingSecret
    }
    vi.resetModules()
    mockRequirePlatformAgentServiceAuth.mockReset().mockResolvedValue(undefined)
    mockBeginPlatformAgentThinkTurn.mockReset().mockResolvedValue({
      runId: '11111111-1111-4111-8111-111111111111',
      startedAtMs: 100,
      agent: 'financial-watch',
      featureKey: 'agent_financial_watch',
      correlationId: 'correlation-123',
      userId: 'user-123',
      clientId: 'client-123',
      tenantId: 'tenant-123',
      deduplicated: false
    })
    mockFailPlatformAgentThinkTurn.mockReset().mockResolvedValue(undefined)
  })

  it('verifies service and signed scope, then records one redacted recovery event', async () => {
    const issued = await issuePlatformAgentScopeAssertion({
      agent: 'financial-watch',
      scope: {
        actor: { type: 'user', id: 'user-123' },
        tenantId: 'tenant-123',
        client: { kind: 'single', clientId: 'client-123' },
        permissions: ['FINANCE'],
        correlationId: 'correlation-123',
        source: 'authenticated_app'
      },
      secret: signingSecret
    })
    const event = {
      body: {
        agent: 'financial-watch',
        instanceId: issued.claims.instanceId,
        scopeAssertion: issued.token,
        requestId: 'request-recovery',
        recoveryRootRequestId: 'request-root',
        modelId: '@cf/moonshotai/kimi-k2.7-code'
      }
    } as any
    const handler = (await import('~~/server/api/internal/platform-agents/think/recovery-exhausted.post')).default

    await expect(handler(event)).resolves.toEqual({ accepted: true })

    expect(mockRequirePlatformAgentServiceAuth).toHaveBeenCalledWith(event)
    expect(event.responseStatus).toBe(202)
    expect(event.responseHeaders['cache-control']).toBe('no-store')
    expect(mockBeginPlatformAgentThinkTurn).toHaveBeenCalledWith({
      agent: 'financial-watch',
      correlationId: 'correlation-123',
      userId: 'user-123',
      clientId: 'client-123',
      tenantId: 'tenant-123',
      idempotencyKey: expect.stringMatching(/^think_recovery_[a-f0-9]{64}$/)
    })
    expect(mockFailPlatformAgentThinkTurn).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'correlation-123' }),
      {
        code: 'chat_recovery_exhausted',
        telemetry: {
          requestId: 'request-recovery',
          status: 'error',
          provider: 'cloudflare-workers-ai',
          modelId: '@cf/moonshotai/kimi-k2.7-code',
          stepCount: 0,
          toolCallCount: 0,
          toolFailureCount: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cachedInputTokens: 0,
          reasoningTokens: 0,
          finishReason: null,
          failureStage: 'recovery',
          recoveryExhausted: true,
          durationMs: 0
        }
      }
    )
    expect(JSON.stringify(mockFailPlatformAgentThinkTurn.mock.calls)).not.toContain(issued.token)
    expect(JSON.stringify(mockFailPlatformAgentThinkTurn.mock.calls)).not.toContain('request-root')
  })

  it('accepts an atomically deduplicated replay without writing another failure', async () => {
    const issued = await issuePlatformAgentScopeAssertion({
      agent: 'financial-watch',
      scope: {
        actor: { type: 'user', id: 'user-123' },
        tenantId: 'tenant-123',
        client: { kind: 'single', clientId: 'client-123' },
        permissions: ['FINANCE'],
        correlationId: 'correlation-123',
        source: 'authenticated_app'
      },
      secret: signingSecret
    })
    mockBeginPlatformAgentThinkTurn.mockResolvedValueOnce({
      runId: null,
      startedAtMs: 100,
      agent: 'financial-watch',
      featureKey: 'agent_financial_watch',
      correlationId: 'correlation-123',
      userId: 'user-123',
      clientId: 'client-123',
      tenantId: 'tenant-123',
      deduplicated: true
    })
    const event = {
      body: {
        agent: 'financial-watch',
        instanceId: issued.claims.instanceId,
        scopeAssertion: issued.token,
        requestId: 'request-recovery',
        recoveryRootRequestId: 'request-root',
        modelId: '@cf/moonshotai/kimi-k2.7-code'
      }
    } as any
    const handler = (await import('~~/server/api/internal/platform-agents/think/recovery-exhausted.post')).default

    await expect(handler(event)).resolves.toEqual({ accepted: true, deduplicated: true })
    expect(event.responseStatus).toBe(202)
    expect(mockFailPlatformAgentThinkTurn).not.toHaveBeenCalled()
  })

  it('rejects tampered assertions before writing telemetry', async () => {
    const handler = (await import('~~/server/api/internal/platform-agents/think/recovery-exhausted.post')).default

    await expect(handler({
      body: {
        agent: 'financial-watch',
        instanceId: `pa_${'x'.repeat(32)}`,
        scopeAssertion: 'pasa1.invalid.invalid',
        requestId: 'request-recovery',
        recoveryRootRequestId: 'request-root',
        modelId: '@cf/moonshotai/kimi-k2.7-code'
      }
    } as any)).rejects.toMatchObject({ statusCode: 401 })
    expect(mockBeginPlatformAgentThinkTurn).not.toHaveBeenCalled()
    expect(mockFailPlatformAgentThinkTurn).not.toHaveBeenCalled()
  })
})
