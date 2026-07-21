import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockStartPlatformAgentRun = vi.fn()
const mockCompletePlatformAgentRun = vi.fn()
const mockFailPlatformAgentRun = vi.fn()
const mockRecordAiInvocation = vi.fn()

vi.mock('~~/server/utils/ai/platformAgentRuns', () => ({
  startPlatformAgentRun: (...args: unknown[]) => mockStartPlatformAgentRun(...args),
  completePlatformAgentRun: (...args: unknown[]) => mockCompletePlatformAgentRun(...args),
  failPlatformAgentRun: (...args: unknown[]) => mockFailPlatformAgentRun(...args)
}))

vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args)
}))

const {
  beginPlatformAgentThinkTurn,
  completePlatformAgentThinkTurn,
  failPlatformAgentThinkTurn,
  denyPlatformAgentThinkTurn
} = await import('~~/server/utils/ai/platformAgentThinkTelemetry')

describe('platform agent Think telemetry reconciliation', () => {
  beforeEach(() => {
    mockStartPlatformAgentRun.mockReset()
    mockCompletePlatformAgentRun.mockReset()
    mockFailPlatformAgentRun.mockReset()
    mockRecordAiInvocation.mockReset()
    mockStartPlatformAgentRun.mockResolvedValue({ ok: true, runId: '11111111-1111-4111-8111-111111111111' })
    mockCompletePlatformAgentRun.mockResolvedValue(undefined)
    mockFailPlatformAgentRun.mockResolvedValue(undefined)
    mockRecordAiInvocation.mockResolvedValue(undefined)
  })

  it('links one prompt-free Think run to one aggregate model invocation by correlation id', async () => {
    const run = await beginPlatformAgentThinkTurn({
      agent: 'spend-controller',
      correlationId: 'correlation-123',
      userId: '22222222-2222-4222-8222-222222222222',
      clientId: '33333333-3333-4333-8333-333333333333',
      tenantId: null
    })

    expect(mockStartPlatformAgentRun).toHaveBeenCalledWith({
      agentType: 'spend_controller',
      featureKey: 'agent_spend_controller',
      mode: 'read_propose',
      userId: '22222222-2222-4222-8222-222222222222',
      clientId: '33333333-3333-4333-8333-333333333333',
      route: '/agency/agents/think/turn',
      context: {
        transport: 'cloudflare_think',
        correlationId: 'correlation-123',
        tenantId: null
      }
    })
    expect(JSON.stringify(mockStartPlatformAgentRun.mock.calls[0]?.[0])).not.toContain('prompt')

    await completePlatformAgentThinkTurn(run, {
      requestId: 'worker-request-123',
      status: 'completed',
      provider: 'cloudflare-workers-ai',
      modelId: '@cf/moonshotai/kimi-k2.7-code',
      stepCount: 2,
      toolCallCount: 1,
      toolFailureCount: 0,
      promptTokens: 1_000,
      completionTokens: 200,
      totalTokens: 1_200,
      cachedInputTokens: 400,
      reasoningTokens: 50,
      finishReason: 'stop',
      failureStage: null,
      recoveryExhausted: false,
      durationMs: 450
    })

    expect(mockCompletePlatformAgentRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: '11111111-1111-4111-8111-111111111111',
      toolCallCount: 1,
      summary: expect.objectContaining({
        transport: 'cloudflare_think',
        correlationId: 'correlation-123',
        workerRequestId: 'worker-request-123',
        modelId: '@cf/moonshotai/kimi-k2.7-code',
        toolFailureCount: 0,
        recoveryExhausted: false
      })
    }))
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'agent_spend_controller',
      provider: 'cloudflare-workers-ai',
      modelId: '@cf/moonshotai/kimi-k2.7-code',
      agentRunId: '11111111-1111-4111-8111-111111111111',
      requestId: 'worker-request-123',
      promptTokens: 1_000,
      completionTokens: 200,
      totalTokens: 1_200,
      cachedInputTokens: 400,
      status: 'success',
      latencyMs: 450,
      metadata: expect.objectContaining({
        correlationId: 'correlation-123',
        transport: 'cloudflare_think',
        toolCallCount: 1
      })
    }))
  })

  it('records a stable operator-visible failure code without persisting upstream details', async () => {
    const run = await beginPlatformAgentThinkTurn({
      agent: 'financial-watch',
      correlationId: 'correlation-456',
      userId: 'user-456',
      clientId: null,
      tenantId: 'tenant-456'
    })

    await failPlatformAgentThinkTurn(run, {
      code: 'worker_http_error',
      modelId: '@cf/moonshotai/kimi-k2.7-code'
    })

    expect(mockFailPlatformAgentRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: '11111111-1111-4111-8111-111111111111',
      error: 'worker_http_error'
    }))
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'agent_financial_watch',
      status: 'error',
      errorCode: 'worker_http_error',
      metadata: expect.objectContaining({
        correlationId: 'correlation-456',
        failureStage: 'transport'
      })
    }))
    expect(JSON.stringify(mockFailPlatformAgentRun.mock.calls)).not.toContain('upstream')
    expect(JSON.stringify(mockRecordAiInvocation.mock.calls)).not.toContain('upstream')
  })

  it('audits admission denial without creating a model invocation', async () => {
    const run = await beginPlatformAgentThinkTurn({
      agent: 'traffic-controller',
      correlationId: 'correlation-denied',
      userId: 'user-denied',
      clientId: null,
      tenantId: null
    })

    await denyPlatformAgentThinkTurn(run, {
      code: 'user_daily_turn_limit',
      retryAfterSeconds: 3_600,
      resetAt: '2026-07-23T00:00:00.000Z'
    })

    expect(mockFailPlatformAgentRun).toHaveBeenCalledWith(expect.objectContaining({
      runId: '11111111-1111-4111-8111-111111111111',
      error: 'user_daily_turn_limit',
      summary: {
        transport: 'cloudflare_think',
        correlationId: 'correlation-denied',
        failureStage: 'admission',
        admissionCode: 'user_daily_turn_limit',
        retryAfterSeconds: 3_600,
        resetAt: '2026-07-23T00:00:00.000Z',
        modelInvoked: false
      }
    }))
    expect(mockRecordAiInvocation).not.toHaveBeenCalled()
  })
})
