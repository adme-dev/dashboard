import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockEdgeClassify = vi.fn()
const mockEdgeGenerateWithLoRA = vi.fn()
const mockGenerateGroqInsight = vi.fn()

vi.mock('~~/server/utils/edgeAi', () => ({
  edgeClassify: (...args: unknown[]) => mockEdgeClassify(...args),
  edgeGenerateWithLoRA: (...args: unknown[]) => mockEdgeGenerateWithLoRA(...args),
}))

vi.mock('~~/server/utils/aiLoraManager', () => ({
  getActiveAdapter: vi.fn().mockResolvedValue(null),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_8B: 'llama-3.1-8b-instant',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const { classifyIntent } = await import('~~/server/utils/aiIntentClassifier')

describe('classifyIntent telemetry', () => {
  beforeEach(() => {
    mockEdgeClassify.mockReset()
    mockEdgeGenerateWithLoRA.mockReset()
    mockGenerateGroqInsight.mockReset()
  })

  it('passes an explicit feature key to edge intent classification', async () => {
    mockEdgeClassify.mockResolvedValueOnce({ category: 'general', confidence: 0.72 })

    const result = await classifyIntent('maybe curious', { context: { cloudflare: { env: { AI: {} } } } } as any)

    expect(result).toMatchObject({ intent: 'general', confidence: 0.72 })
    expect(mockEdgeClassify).toHaveBeenCalledWith(
      expect.anything(),
      'maybe curious',
      expect.arrayContaining(['task_query', 'general']),
      {
        featureKey: 'agency_ai_intent_edge_classifier',
        metadata: {
          classifier: 'intent',
          stage: 'edge',
          messageChars: 13,
          intentCount: 12,
        },
      },
    )
    expect(mockGenerateGroqInsight).not.toHaveBeenCalled()
  })

  it('passes an explicit feature key to Groq fallback classification', async () => {
    mockGenerateGroqInsight.mockResolvedValueOnce(JSON.stringify({
      intent: 'process_query',
      confidence: 0.8,
      entities: ['Onboarding'],
    }))

    const result = await classifyIntent('maybe onboarding flow')

    expect(result).toMatchObject({ intent: 'process_query', confidence: 0.8, entities: ['Onboarding'] })
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('maybe onboarding flow'), expect.objectContaining({
      model: 'llama-3.1-8b-instant',
      featureKey: 'agency_ai_intent_groq_classifier',
      metadata: {
        classifier: 'intent',
        stage: 'groq_fallback',
        messageChars: 21,
        intentCount: 12,
      },
    }))
  })
})
