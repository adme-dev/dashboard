import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: (event: any) => Promise<unknown>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = async event => event.body
testGlobal.createError = (opts) => Object.assign(new Error(opts.statusMessage), opts)

const mockRequireAuth = vi.fn()
const mockRequireRole = vi.fn()
const mockFetchCanonicalFact = vi.fn()
const mockEdgeGenerate = vi.fn()
const mockGenerateGroqInsight = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('~~/server/utils/canonicalFactQuery', () => ({
  fetchCanonicalFact: (...args: unknown[]) => mockFetchCanonicalFact(...args),
}))

vi.mock('~~/server/utils/edgeAi', () => ({
  edgeGenerate: (...args: unknown[]) => mockEdgeGenerate(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_70B: 'llama-3.3-70b-versatile',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const { default: summaryHandler } = await import('../../../../server/api/agency/analytics/ai-summary.post')
const { default: askHandler } = await import('../../../../server/api/agency/analytics/ask.post')

function event(body: Record<string, unknown>) {
  return { body } as any
}

beforeEach(() => {
  mockRequireAuth.mockReset().mockResolvedValue({ id: 'user-1' })
  mockRequireRole.mockReset().mockResolvedValue({ id: 'user-1' })
  mockFetchCanonicalFact.mockReset()
  mockEdgeGenerate.mockReset()
  mockGenerateGroqInsight.mockReset()
})

describe('agency analytics AI endpoints', () => {
  it('records Model Ops metadata for campaign breakdown summaries', async () => {
    mockEdgeGenerate.mockResolvedValue('• Mobile is strongest')

    const result = await summaryHandler(event({
      campaignId: 'campaign-1',
      campaignName: 'EOFY',
      platform: 'meta',
      breakdowns: {
        age: [{ dimensionValue: '25-34', spend: 100, ctr: 2.4 }],
        gender: [{ dimensionValue: 'female', clicks: 30, ctr: 2.1 }],
        device: [{ dimensionValue: 'mobile', impressions: 1000 }],
        geo: [{ dimensionValue: 'VIC', spend: 50 }],
      },
    }))

    expect(result).toEqual({ summary: '• Mobile is strongest' })
    expect(mockEdgeGenerate).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('EOFY'), expect.objectContaining({
      featureKey: 'agency_analytics_ai_summary',
      userId: 'user-1',
      requestId: 'campaign-1',
      metadata: {
        route: '/api/agency/analytics/ai-summary',
        campaignId: 'campaign-1',
        platform: 'meta',
        hasCampaignName: true,
        ageBreakdownCount: 1,
        genderBreakdownCount: 1,
        deviceBreakdownCount: 1,
        geoBreakdownCount: 1,
      },
    }))
  })

  it('records Model Ops metadata for grounded analytics questions', async () => {
    mockFetchCanonicalFact.mockResolvedValue([
      { channel: 'meta', spend: 100, leads: 5, conversions: 2, revenue: 400, sessions: 50 },
      { channel: 'google', spend: 200, leads: 10, conversions: 4, revenue: 900, sessions: 100 },
    ])
    mockGenerateGroqInsight.mockResolvedValue('Google had the most revenue.')

    const result = await askHandler(event({
      question: 'Which channel drove the most revenue?',
      startDate: '2026-06-01',
      endDate: '2026-06-25',
      clientId: 'client-1',
    }))

    expect(result.answer).toBe('Google had the most revenue.')
    expect(mockFetchCanonicalFact).toHaveBeenCalledWith({
      startDate: '2026-06-01',
      endDate: '2026-06-25',
      clientId: 'client-1',
    })
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Which channel drove'), expect.objectContaining({
      featureKey: 'agency_analytics_ask',
      userId: 'user-1',
      clientId: 'client-1',
      requestId: '2026-06-01:2026-06-25:client-1',
      metadata: {
        route: '/api/agency/analytics/ask',
        scope: 'client',
        startDate: '2026-06-01',
        endDate: '2026-06-25',
        channelCount: 2,
        questionChars: 37,
      },
    }))
  })
})
