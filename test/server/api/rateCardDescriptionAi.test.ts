import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  eventHandler: <T>(fn: T) => T
  readBody: (event: any) => Promise<unknown>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
  useRuntimeConfig: () => Record<string, unknown>
}

testGlobal.eventHandler = fn => fn
testGlobal.readBody = async event => event.body
testGlobal.createError = (opts) => Object.assign(new Error(opts.statusMessage), opts)
testGlobal.useRuntimeConfig = () => ({})

const mockRequireAuth = vi.fn()
const mockGenerateGroqInsight = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_70B: 'llama-3.3-70b-versatile',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const { default: handler } = await import('../../../../server/api/agency/rate-cards/generate-description.post')

function event(body: Record<string, unknown>) {
  return { body } as any
}

describe('POST /api/agency/rate-cards/generate-description', () => {
  beforeEach(() => {
    delete process.env.PERPLEXITY_API_KEY
    delete process.env.AI_GATEWAY_URL
    mockRequireAuth.mockReset().mockResolvedValue({ id: 'user-1' })
    mockGenerateGroqInsight.mockReset().mockResolvedValue('Professional service description.')
  })

  it('records explicit Model Ops metadata for rate-card description generation', async () => {
    const result = await handler(event({
      serviceName: 'SEO Audit',
      categoryName: 'SEO',
      price: 1200,
      priceUnit: 'fixed',
      setupFee: 200,
      setupNotes: 'Kickoff workshop',
      notes: 'For automotive dealers',
    }))

    expect(result).toEqual({ description: 'Professional service description.' })
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('SEO Audit'), expect.objectContaining({
      model: 'llama-3.3-70b-versatile',
      featureKey: 'rate_card_description',
      userId: 'user-1',
      metadata: {
        route: '/api/agency/rate-cards/generate-description',
        categoryName: 'SEO',
        priceUnit: 'fixed',
        priceMode: 'fixed',
        hasSetupFee: true,
        hasSetupNotes: true,
        hasContextNotes: true,
        hasWebResearch: false,
      },
    }))
  })

  it('rejects missing service name before model generation', async () => {
    await expect(handler(event({ categoryName: 'SEO' }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Service name is required',
    })
    expect(mockGenerateGroqInsight).not.toHaveBeenCalled()
  })
})
