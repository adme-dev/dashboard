import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRecordAiInvocation = vi.fn()
vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args),
}))

const {
  edgeClassify,
  edgeGenerate,
  edgeGenerateWithLoRA,
  edgeSummarize,
} = await import('~~/server/utils/edgeAi')

function eventWithAi(run = vi.fn()) {
  return {
    context: {
      cloudflare: {
        env: {
          AI: { run },
        },
      },
    },
  } as any
}

describe('edgeAi telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records Workers AI edge generation invocations', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'done' })

    const result = await edgeGenerate(eventWithAi(run), 'Summarize this', {
      featureKey: 'custom_edge_feature',
      userId: 'user-1',
      requestId: 'req-1',
      metadata: { route: '/api/test' },
    })

    expect(result).toBe('done')
    expect(run).toHaveBeenCalledWith('@cf/meta/llama-3.1-8b-instruct', expect.objectContaining({
      max_tokens: 256,
      temperature: 0.3,
    }))
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'custom_edge_feature',
      provider: 'workers_ai',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      gatewayUsed: true,
      userId: 'user-1',
      requestId: 'req-1',
      status: 'success',
      metadata: expect.objectContaining({ route: '/api/test', hasResponse: true }),
    }))
  })

  it('records classification calls before parsing the model response', async () => {
    const run = vi.fn().mockResolvedValue({ response: '{"category":"sales","confidence":0.91}' })

    const result = await edgeClassify(eventWithAi(run), 'buy this today', ['sales', 'support'])

    expect(result).toEqual({ category: 'sales', confidence: 0.91 })
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'workers_ai_edge_classify',
      provider: 'workers_ai',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      status: 'success',
      metadata: expect.objectContaining({ categories: ['sales', 'support'], hasResponse: true }),
    }))
  })

  it('records LoRA fallback usage when the adapter call fails', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('adapter missing'))
      .mockResolvedValueOnce({ response: 'base response' })

    const result = await edgeGenerateWithLoRA(eventWithAi(run), 'Write copy', {
      loraAdapter: { id: 'adapter-1', name: 'dealer-style' },
    })

    expect(result).toEqual({ response: 'base response', usedLora: false, adapterId: null })
    expect(mockRecordAiInvocation).toHaveBeenCalledTimes(1)
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'workers_ai_edge_generate_lora',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      fallbackUsed: true,
      metadata: expect.objectContaining({
        loraAttempted: true,
        loraAdapterId: 'adapter-1',
        loraError: 'adapter missing',
      }),
    }))
  })

  it('uses a summarize-specific feature key', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'short' })

    await edgeSummarize(eventWithAi(run), 'Long text', 90)

    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'workers_ai_edge_summarize',
    }))
  })
})
