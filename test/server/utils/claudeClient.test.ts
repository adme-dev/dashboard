import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mockRecordAiInvocation = vi.fn()
const mockParse = vi.fn()

vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args),
}))

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      parse: (...args: unknown[]) => mockParse(...args),
      create: vi.fn(),
    }
  }
  return { default: Anthropic }
})

vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({
  zodOutputFormat: (schema: unknown) => schema,
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: () => vi.fn(),
}))

vi.mock('@ai-sdk/groq', () => ({
  createGroq: () => vi.fn(),
}))

vi.mock('workers-ai-provider', () => ({
  createWorkersAI: () => vi.fn(),
}))

beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', () => ({ anthropicApiKey: 'test-key' }))
  mockRecordAiInvocation.mockReset()
  mockRecordAiInvocation.mockResolvedValue(undefined)
  mockParse.mockReset()
})

describe('generateClaudeStructured', () => {
  it('records invocation telemetry when featureKey is supplied', async () => {
    mockParse.mockResolvedValueOnce({
      parsed_output: { ok: true },
      model: 'claude-sonnet-4-6',
      usage: {
        input_tokens: 100,
        output_tokens: 25,
        cache_read_input_tokens: 10,
        cache_creation_input_tokens: 5,
      },
    })

    const { generateClaudeStructured } = await import('~~/server/utils/claudeClient')
    const result = await generateClaudeStructured('prompt', {
      schema: z.object({ ok: z.boolean() }),
      featureKey: 'financial_advisor',
      clientId: 'client-1',
      metadata: { route: '/api/test' },
    })

    expect(result.parsed).toEqual({ ok: true })
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'financial_advisor',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      clientId: 'client-1',
      promptTokens: 100,
      completionTokens: 25,
      totalTokens: 125,
      status: 'success',
    }))
  })
})
