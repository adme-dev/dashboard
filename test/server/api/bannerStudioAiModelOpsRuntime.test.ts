import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: (event: { body?: unknown }) => Promise<unknown>
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = async event => event.body ?? {}
;(globalThis as typeof globalThis & { createError: (input: unknown) => unknown }).createError = input => input

const mockRequireAuth = vi.fn()
const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockEdgeGenerate = vi.fn()
const mockGenerateGroqInsight = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

vi.mock('~~/server/utils/edgeAi', () => ({
  edgeGenerate: (...args: unknown[]) => mockEdgeGenerate(...args)
}))

vi.mock('~~/server/utils/groqClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/groqClient')>()
  return {
    ...actual,
    generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args)
  }
})

const { default: copySuggestHandler } = await import(
  '../../../server/api/agency/banner-studio/ai/copy-suggest.post'
)

describe('Banner Studio AI Model Ops runtime routing', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockQueryRows.mockReset()
    mockExecute.mockReset()
    mockEdgeGenerate.mockReset()
    mockGenerateGroqInsight.mockReset()
    mockRequireAuth.mockResolvedValue({ id: 'user-1' })
  })

  it('uses a saved Groq override and skips the Workers AI primary path', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      feature_key: 'banner_copy_suggest',
      provider: 'groq',
      model_id: 'llama-3.3-70b-versatile',
      fallback_model_id: null,
      notes: 'Use Groq for copy variants.',
      updated_by: null,
      updated_at: '2026-06-25T00:00:00.000Z',
      created_at: '2026-06-25T00:00:00.000Z'
    }])
    mockGenerateGroqInsight.mockResolvedValue('[{"text":"Drive More Leads","tone":"benefit-focused"}]')

    const result = await copySuggestHandler({
      body: {
        text: 'Get leads',
        context: { format: '300x250' }
      }
    } as never)

    expect(mockEdgeGenerate).not.toHaveBeenCalled()
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      model: 'llama-3.3-70b-versatile',
      featureKey: 'banner_copy_suggest',
      metadata: expect.objectContaining({
        providerPath: 'groq',
        modelAssignmentSource: 'override'
      })
    }))
    expect(result.suggestions[0]).toMatchObject({
      text: 'Drive More Leads',
      tone: 'benefit-focused',
      charCount: 16
    })
  })

  it('uses Workers AI by default and only falls back to Groq when needed', async () => {
    mockQueryRows.mockResolvedValueOnce([])
    mockEdgeGenerate.mockResolvedValue('[{"text":"Fresh Offer","tone":"punchy"}]')

    const result = await copySuggestHandler({
      body: {
        text: 'New offer',
        context: { projectName: 'Winter Campaign' }
      }
    } as never)

    expect(mockEdgeGenerate).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      featureKey: 'banner_copy_suggest',
      metadata: expect.objectContaining({
        providerPath: 'workers_ai',
        modelAssignmentSource: 'default'
      })
    }))
    expect(mockGenerateGroqInsight).not.toHaveBeenCalled()
    expect(result.suggestions[0]).toMatchObject({
      text: 'Fresh Offer',
      tone: 'punchy',
      charCount: 11
    })
  })
})
