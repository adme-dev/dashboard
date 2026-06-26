import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { body?: any }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.readBody = async (e: TestEvent) => e.body ?? {}
g.createError = (i: { statusCode: number; statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)

const mockRequireRole = vi.fn()
const mockGenerate = vi.fn()

vi.mock('~~/server/utils/auth', () => ({ requireRole: (...a: unknown[]) => mockRequireRole(...a) }))
vi.mock('~~/server/utils/permissions', () => ({ PERMISSIONS: { CREATIVE: ['owner'] } }))
vi.mock('~~/server/utils/groqClient', () => ({ GROQ_MODELS: { LLAMA_70B: 'llama-3.3-70b-versatile' } }))
vi.mock('~~/server/utils/ai/resolvedGroq', () => ({ generateModelRoutedGroqInsight: (...a: unknown[]) => mockGenerate(...a) }))

const { default: handler } = await import('../../server/api/agency/social/publishing/ai/generate-caption.post')

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireRole.mockResolvedValue({ id: 'U1' })
  mockGenerate.mockResolvedValue('  Big news! 🎉  ')
})

describe('generate-caption', () => {
  it('returns a trimmed caption and includes the platform guideline in the prompt', async () => {
    const res = await handler({ body: { topic: 'launch of our new app', platform: 'instagram', tone: 'playful' } } as any)
    expect(res).toEqual({ caption: 'Big news! 🎉' })
    const [prompt, opts] = mockGenerate.mock.calls[0]
    expect(prompt).toContain('instagram')
    expect(prompt).toContain('playful')
    expect(prompt).toContain('launch of our new app')
    expect(prompt.toLowerCase()).toContain('hashtag') // instagram guideline mentions hashtags
    expect(opts.temperature).toBeGreaterThan(0)
    expect(opts).toMatchObject({
      featureKey: 'social_publishing_caption',
      userId: 'U1',
      metadata: expect.objectContaining({
        route: '/api/agency/social/publishing/ai/generate-caption',
        platform: 'instagram',
        tone: 'playful',
      }),
    })
  })

  it('falls back to content when topic is absent', async () => {
    await handler({ body: { content: 'refine this draft', platform: 'linkedin' } } as any)
    expect(mockGenerate.mock.calls[0][0]).toContain('refine this draft')
  })

  it('rejects when neither topic nor content is provided', async () => {
    await expect(handler({ body: {} } as any)).rejects.toThrow('topic or content required')
    expect(mockGenerate).not.toHaveBeenCalled()
  })
})
