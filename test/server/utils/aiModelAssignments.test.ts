import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

const {
  groqModelIdFromAssignment,
  modelProviderMatches,
  modelSpecForAssignment,
  resolveAiModelAssignment
} = await import('~~/server/utils/ai/modelAssignments')

describe('ai model assignment runtime resolver', () => {
  beforeEach(() => {
    mockQueryRows.mockReset()
    mockExecute.mockReset()
  })

  it('applies a catalogued admin override for a supported runtime provider', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      feature_key: 'social_spend_ai_analysis',
      provider: 'groq',
      model_id: 'llama-3.3-70b-versatile',
      fallback_model_id: null,
      notes: 'Use cheaper review model during testing.',
      updated_by: null,
      updated_at: '2026-06-25T00:00:00.000Z',
      created_at: '2026-06-25T00:00:00.000Z'
    }])

    const result = await resolveAiModelAssignment({
      featureKey: 'social_spend_ai_analysis',
      defaultProvider: 'groq',
      defaultModelId: 'openai/gpt-oss-120b',
      supportedProviders: ['groq']
    })

    expect(result).toMatchObject({
      provider: 'groq',
      modelId: 'llama-3.3-70b-versatile',
      source: 'override',
      ignoredReason: null,
      modelSpec: 'groq/llama-3.3-70b-versatile'
    })
  })

  it('fails open to defaults when the assignment migration is missing', async () => {
    const error = new Error('relation "ai_model_assignments" does not exist') as Error & { code?: string }
    error.code = '42P01'
    mockQueryRows.mockRejectedValueOnce(error)

    const result = await resolveAiModelAssignment({
      featureKey: 'banner_copy_suggest',
      defaultProvider: 'workers_ai',
      defaultModelId: '@cf/meta/llama-3.1-8b-instruct',
      defaultFallbackModelId: 'llama-3.1-8b-instant',
      supportedProviders: ['workers_ai', 'groq']
    })

    expect(result).toMatchObject({
      provider: 'workers_ai',
      modelId: '@cf/meta/llama-3.1-8b-instruct',
      fallbackModelId: 'llama-3.1-8b-instant',
      source: 'default'
    })
    expect(result.ignoredReason).toContain('Run migration 204_ai_model_assignments.sql')
  })

  it('ignores existing overrides that the feature runtime cannot execute', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      feature_key: 'social_spend_ai_analysis',
      provider: 'anthropic',
      model_id: 'claude-sonnet-4-6',
      fallback_model_id: null,
      notes: 'Legacy unsafe override.',
      updated_by: null,
      updated_at: '2026-06-25T00:00:00.000Z',
      created_at: '2026-06-25T00:00:00.000Z'
    }])

    const result = await resolveAiModelAssignment({
      featureKey: 'social_spend_ai_analysis',
      defaultProvider: 'groq',
      defaultModelId: 'openai/gpt-oss-120b',
      supportedProviders: ['groq']
    })

    expect(result.provider).toBe('groq')
    expect(result.modelId).toBe('openai/gpt-oss-120b')
    expect(result.source).toBe('default')
    expect(result.ignoredReason).toContain('Provider anthropic is not supported')
  })

  it('normalizes provider model specs for Gateway-backed clients', () => {
    expect(modelSpecForAssignment('groq', 'openai/gpt-oss-120b')).toBe('groq/openai/gpt-oss-120b')
    expect(modelSpecForAssignment('anthropic', 'claude-sonnet-4-6')).toBe('anthropic/claude-sonnet-4-6')
    expect(modelSpecForAssignment('workers_ai', '@cf/meta/llama-3.1-8b-instruct')).toBe('workersai/@cf/meta/llama-3.1-8b-instruct')
    expect(groqModelIdFromAssignment('groq/openai/gpt-oss-120b')).toBe('openai/gpt-oss-120b')
    expect(modelProviderMatches('workers_ai', '@cf/meta/llama-3.1-8b-instruct')).toBe(true)
  })
})
