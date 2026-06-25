import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args)
}))

const {
  estimateAiInvocationCostUsd,
  recordAiInvocation
} = await import('~~/server/utils/ai/invocationLedger')

describe('ai invocation ledger', () => {
  beforeEach(() => {
    mockExecute.mockReset()
    mockExecute.mockResolvedValue(1)
  })

  it('estimates token cost from model pricing', () => {
    expect(estimateAiInvocationCostUsd({
      modelId: 'openai/gpt-oss-120b',
      promptTokens: 1000,
      completionTokens: 500
    })).toBeCloseTo(0.00045)
  })

  it('records invocations without prompt content', async () => {
    await recordAiInvocation({
      featureKey: 'social_spend_ai_analysis',
      provider: 'groq',
      modelId: 'openai/gpt-oss-120b',
      gatewayUsed: true,
      fallbackUsed: false,
      promptTokens: 100,
      completionTokens: 50,
      metadata: { route: '/api/test' }
    })

    expect(mockExecute).toHaveBeenCalledTimes(1)
    const params = mockExecute.mock.calls[0][1]
    expect(params).toContain('social_spend_ai_analysis')
    expect(params).toContain('openai/gpt-oss-120b')
    expect(params).not.toContain('prompt text')
    expect(params[16]).toBe(JSON.stringify({ route: '/api/test' }))
  })

  it('swallows logging failures', async () => {
    mockExecute.mockRejectedValueOnce(new Error('table missing'))

    await expect(recordAiInvocation({
      featureKey: 'x',
      provider: 'groq',
      modelId: 'unknown-model',
      status: 'error'
    })).resolves.toBeUndefined()
  })
})
