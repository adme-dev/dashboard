import { describe, expect, it } from 'vitest'
import { estimateAiInvocationCostUsd } from '~~/server/utils/ai/invocationLedger'

describe('AI invocation ledger pricing', () => {
  it('prices Workers AI Kimi K2.7 with its discounted cached input tokens', () => {
    expect(estimateAiInvocationCostUsd({
      modelId: '@cf/moonshotai/kimi-k2.7-code',
      promptTokens: 1_000,
      completionTokens: 200,
      cachedInputTokens: 400
    })).toBeCloseTo(0.001446, 10)
  })

  it('clamps cached input tokens to the reported prompt token count', () => {
    expect(estimateAiInvocationCostUsd({
      modelId: '@cf/moonshotai/kimi-k2.7-code',
      promptTokens: 100,
      completionTokens: 10,
      cachedInputTokens: 1_000
    })).toBeCloseTo(0.000059, 10)
  })
})
