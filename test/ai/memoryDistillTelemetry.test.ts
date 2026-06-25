import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGenerateGroqInsight = vi.fn()
const mockListRecentMemories = vi.fn()
const mockUpsertMemory = vi.fn()
const mockIndexMemoryVector = vi.fn()
const mockMarkEmbedded = vi.fn()

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    REASONING_20B: 'openai/gpt-oss-20b',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

vi.mock('~~/server/utils/ai/memory/store', () => ({
  getMemoriesByIds: vi.fn(),
  listRecentMemories: (...args: unknown[]) => mockListRecentMemories(...args),
  listSharedMemories: vi.fn(),
  listUserDepartments: vi.fn(),
  stampUsed: vi.fn(),
  upsertMemory: (...args: unknown[]) => mockUpsertMemory(...args),
  markEmbedded: (...args: unknown[]) => mockMarkEmbedded(...args),
}))

vi.mock('~~/server/utils/ai/memory/embed', () => ({
  indexMemoryVector: (...args: unknown[]) => mockIndexMemoryVector(...args),
}))

const { distillAndStoreMemories } = await import('~~/server/utils/ai/memory/orchestrate')

describe('AI memory distillation telemetry', () => {
  beforeEach(() => {
    mockGenerateGroqInsight.mockReset().mockResolvedValue(JSON.stringify([
      {
        memType: 'preference',
        content: 'Prefers short weekly status summaries.',
        salience: 0.8,
      },
    ]))
    mockListRecentMemories.mockReset().mockResolvedValue([])
    mockUpsertMemory.mockReset().mockResolvedValue('memory-1')
    mockIndexMemoryVector.mockReset().mockResolvedValue(true)
    mockMarkEmbedded.mockReset().mockResolvedValue(undefined)
  })

  it('records Model Ops metadata for the default memory distillation model call', async () => {
    const saved = await distillAndStoreMemories({
      userId: 'user-1',
      turn: {
        userMessage: 'Please keep future updates short.',
        assistantMessage: 'Noted. I will keep weekly updates concise.',
      },
    })

    expect(saved).toBe(1)
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Please keep future updates short.'), expect.objectContaining({
      model: 'openai/gpt-oss-20b',
      featureKey: 'ai_memory_distillation',
      metadata: {
        route: 'aiMemory.distillAndStoreMemories',
        promptChars: expect.any(Number),
      },
    }))
    expect(mockUpsertMemory).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      memType: 'semantic',
      content: 'Prefers short weekly status summaries.',
      source: 'inferred',
      salience: 0.8,
    }))
  })
})
