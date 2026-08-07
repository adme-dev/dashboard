import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AudienceBreakdownsResponse,
  AudienceBreakdownRow,
  AudienceOverviewResponse,
  AudienceRange
} from '../../../../app/types/audience-analytics'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  readBody: (event: unknown) => Promise<unknown>
  createError: (options: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.readBody = async event => (event as { body?: unknown }).body
testGlobal.createError = options => Object.assign(new Error(options.statusMessage), options)

const mockRequireScope = vi.fn()
const mockGetOverview = vi.fn()
const mockGetBreakdowns = vi.fn()
const mockGenerateInsight = vi.fn()

vi.mock('~~/server/utils/tracking/analytics-access', () => ({
  requireTrackingAudienceScope: (...args: unknown[]) => mockRequireScope(...args)
}))

vi.mock('~~/server/utils/tracking/audience-repository', () => ({
  getAudienceOverview: (...args: unknown[]) => mockGetOverview(...args),
  getAudienceBreakdowns: (...args: unknown[]) => mockGetBreakdowns(...args)
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: { LLAMA_70B: 'llama-3.3-70b-versatile' }
}))

vi.mock('~~/server/utils/ai/resolvedGroq', () => ({
  generateModelRoutedGroqInsight: (...args: unknown[]) => mockGenerateInsight(...args)
}))

const { default: askHandler } = await import(
  '../../../../server/api/agency/tracking/audiences/ask.post'
)

const CLIENT_A = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const range: AudienceRange = {
  fromDate: '2026-07-03',
  toDate: '2026-08-01',
  previousFromDate: '2026-06-03',
  previousToDate: '2026-07-02',
  days: 30
}

const overview = {
  generatedAt: '2026-08-01T12:00:00.000Z',
  window: range,
  coverage: {
    total: 1,
    receiving: 1,
    stale: 0,
    noRecentData: 0,
    neverReceived: 0,
    inactive: 0,
    sites: []
  },
  kpis: {
    visitors: 100,
    sessions: 120,
    pageViews: 250,
    engagedSessions: 72,
    engagementRate: 60,
    repeatVisitors: 20,
    leadActions: 12,
    confirmedLeads: 8,
    visitorToLeadRate: 8,
    attributionCoverage: 75,
    anon_id: 'must-not-leak',
    email: 'person@example.com'
  },
  previousKpis: {
    visitors: 80,
    sessions: 100,
    pageViews: 200,
    engagedSessions: 50,
    engagementRate: 50,
    repeatVisitors: 15,
    leadActions: 10,
    confirmedLeads: 10,
    visitorToLeadRate: 12.5,
    attributionCoverage: 50,
    phone: '0400000000'
  },
  opportunities: [{
    code: 'high_intent_non_converters',
    title: 'High-intent visitors have not converted',
    description: 'Strong on-site intent without a lead action.',
    status: 'opportunity',
    count: 14,
    thresholds: { minimumSessions: 20 },
    evidence: { sessions: 100 },
    fingerprint: 'must-not-leak'
  }],
  clients: [],
  availableClients: [{ id: CLIENT_A, name: 'Alpha Motors' }]
} as unknown as AudienceOverviewResponse

function breakdown(dimension: AudienceBreakdownsResponse['dimension']): AudienceBreakdownsResponse {
  return {
    generatedAt: '2026-08-01T12:00:00.000Z',
    window: range,
    dimension,
    rows: [{
      key: dimension === 'source' ? 'google' : dimension === 'campaign' ? 'winter-sale' : '/vehicles/suv',
      visitors: 40,
      sessions: 50,
      engagementRate: 62,
      leadActions: 8,
      confirmedLeads: 5,
      confirmedLeadRate: 10,
      gclid: 'must-not-leak',
      session_id: 'must-not-leak'
    } as unknown as AudienceBreakdownRow]
  }
}

function event(body: Record<string, unknown>) {
  return { body } as Parameters<typeof askHandler>[0]
}

beforeEach(() => {
  mockRequireScope.mockReset().mockResolvedValue({
    user: { id: USER_ID, role: 'media_buyer' },
    accessibleClientIds: [CLIENT_A],
    clientIds: [CLIENT_A]
  })
  mockGetOverview.mockReset().mockResolvedValue(overview)
  mockGetBreakdowns.mockReset().mockImplementation(({ dimension }) => breakdown(dimension))
  mockGenerateInsight.mockReset().mockResolvedValue(
    'Website intent is rising, but confirmed leads are lower than the previous period.'
  )
})

describe('website audience analyst', () => {
  it('rejects missing and overlong questions before resolving data scope', async () => {
    await expect(askHandler(event({ question: '   ' }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'question is required'
    })
    await expect(askHandler(event({ question: 'x'.repeat(501) }))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'question must be 500 characters or fewer'
    })
    expect(mockRequireScope).not.toHaveBeenCalled()
  })

  it('answers from the selected tenant scope and returns the exact redacted grounding', async () => {
    const result = await askHandler(event({
      question: 'Brief the marketing team on this audience window.',
      from: '2026-07-03',
      to: '2026-08-01',
      clientId: CLIENT_A
    }))

    expect(result.answer).toContain('Website intent is rising')
    expect(result.generatedAt).toEqual(expect.any(String))
    expect(mockRequireScope).toHaveBeenCalledWith(expect.anything(), CLIENT_A)
    expect(mockGetOverview).toHaveBeenCalledWith({
      range,
      clientIds: [CLIENT_A],
      accessibleClientIds: [CLIENT_A]
    })
    expect(mockGetBreakdowns).toHaveBeenCalledTimes(3)

    const [prompt, options] = mockGenerateInsight.mock.calls[0]
    expect(prompt).toContain('Brief the marketing team')
    expect(prompt).toContain('"visitors":100')
    expect(prompt).toContain('"fromDate":"2026-07-03"')
    expect(options).toMatchObject({
      defaultModelId: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      maxTokens: 650,
      featureKey: 'agency_audience_analytics_ask',
      userId: USER_ID,
      clientId: CLIENT_A,
      requestId: '2026-07-03:2026-08-01:11111111-1111-4111-8111-111111111111',
      metadata: {
        route: '/api/agency/tracking/audiences/ask',
        scope: 'client',
        startDate: '2026-07-03',
        endDate: '2026-08-01',
        questionChars: 49,
        opportunityCount: 1,
        breakdownRowCount: 3
      }
    })

    const serializedPrompt = String(prompt)
    const serializedGrounding = JSON.stringify(result.grounding)
    expect(serializedPrompt).not.toMatch(/anon_id|session_id|gclid|fingerprint|person@example|0400000000/i)
    expect(serializedGrounding).not.toMatch(/anon_id|session_id|gclid|fingerprint|email|phone/i)
    expect(serializedPrompt).toContain(serializedGrounding)
  })

  it('returns a controlled upstream error without changing deterministic data', async () => {
    mockGenerateInsight.mockRejectedValue(new Error('provider token and body must not leak'))

    await expect(askHandler(event({
      question: 'What changed?',
      from: '2026-07-03',
      to: '2026-08-01'
    }))).rejects.toMatchObject({
      statusCode: 502,
      statusMessage: 'Insight generation unavailable'
    })
    expect(mockGetOverview).toHaveBeenCalledTimes(1)
  })
})
