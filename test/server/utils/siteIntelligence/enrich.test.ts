import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockReadSnapshot = vi.fn()
const mockComplete = vi.fn()
const mockUpsertVector = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))
vi.mock('~~/server/utils/siteIntelligence/storage', () => ({
  readSiteIntelligenceSnapshot: (...args: unknown[]) => mockReadSnapshot(...args)
}))
vi.mock('~~/server/utils/ai/resolvedGroq', () => ({
  generateModelRoutedGroqInsight: (...args: unknown[]) => mockComplete(...args)
}))
vi.mock('~~/server/utils/siteIntelligence/vectorize', () => ({
  upsertSiteIntelligencePageVector: (...args: unknown[]) => mockUpsertVector(...args)
}))

const { enrichSiteIntelligencePage } = await import('~~/server/utils/siteIntelligence/enrich')

const payload = {
  clientId: '11111111-1111-4111-8111-111111111111',
  domainId: '22222222-2222-4222-8222-222222222222',
  pageId: '33333333-3333-4333-8333-333333333333',
  changeId: '44444444-4444-4444-8444-444444444444',
  contentHash: 'a'.repeat(64)
}
const requestEvent = {
  context: { cloudflare: { env: { AI: {}, SITE_INTELLIGENCE_BUCKET: {} } } }
} as NonNullable<Parameters<typeof enrichSiteIntelligencePage>[1]>

const context = {
  page_id: payload.pageId,
  client_id: payload.clientId,
  domain_id: payload.domainId,
  content_hash: payload.contentHash,
  r2_object_key: `clients/${payload.clientId}/domains/${payload.domainId}/runs/run/${payload.contentHash}.md`,
  facts: {
    pageType: 'offer', model: 'Haval H6', driveAwayPrice: 42990,
    offerTypes: ['price'], ctas: ['test_drive'],
    finance: { repayment: 189, email: 'unsafe@example.com' },
    eventPayload: { sessionId: 'unsafe-session' }
  },
  ai_input_allowed: true,
  lane: 'competitor',
  settings: { crawlPurposes: ['search', 'ai-input'] }
}

beforeEach(() => {
  process.env.SITE_INTELLIGENCE_AI_ENABLED = 'true'
  mockQueryOne.mockReset().mockResolvedValueOnce(context).mockResolvedValueOnce({ id: payload.pageId })
  mockReadSnapshot.mockReset().mockResolvedValue('Public offer copy. Contact person@example.com or 0412 345 678. sessionId=abc123')
  mockComplete.mockReset().mockResolvedValue(JSON.stringify({
    pageType: 'offer',
    summary: 'A public Haval H6 drive-away offer.',
    offerSummary: '$42,990 drive away.',
    themes: ['drive-away', 'test drive'],
    confidence: 0.92,
    evidenceFields: ['driveAwayPrice', 'ctas']
  }))
  mockUpsertVector.mockReset().mockResolvedValue(undefined)
})

describe('enrichSiteIntelligencePage', () => {
  it('skips every policy gate before reading content or calling a model', async () => {
    const cases = [
      { name: 'feature disabled', env: 'false', row: context },
      { name: 'domain permission off', env: 'true', row: { ...context, ai_input_allowed: false } },
      { name: 'run purpose missing', env: 'true', row: { ...context, settings: { crawlPurposes: ['search'] } } },
      { name: 'hash superseded', env: 'true', row: { ...context, content_hash: 'b'.repeat(64) } },
      { name: 'no relevant facts', env: 'true', row: { ...context, facts: { pageType: 'other' } } }
    ]

    for (const testCase of cases) {
      process.env.SITE_INTELLIGENCE_AI_ENABLED = testCase.env
      mockQueryOne.mockReset().mockResolvedValue(testCase.row)
      mockReadSnapshot.mockClear()
      mockComplete.mockClear()

      const result = await enrichSiteIntelligencePage(payload, requestEvent)

      expect(result.status, testCase.name).toBe('skipped')
      expect(mockReadSnapshot, testCase.name).not.toHaveBeenCalled()
      expect(mockComplete, testCase.name).not.toHaveBeenCalled()
    }
  })

  it('sends only allowlisted, redacted page context and persists strict validated output', async () => {
    const result = await enrichSiteIntelligencePage(payload, requestEvent)

    expect(result).toEqual({ status: 'enriched' })
    const prompt = String(mockComplete.mock.calls[0]?.[0])
    expect(prompt).not.toMatch(/person@example\.com|unsafe@example\.com|0412 345 678|sessionId|abc123|unsafe-session|eventPayload/i)
    expect(prompt).toContain('Haval H6')
    expect(mockQueryOne.mock.calls[1]?.[0]).toContain('content_hash = $3')
    const persisted = JSON.parse(mockQueryOne.mock.calls[1]?.[1]?.[3] as string)
    expect(persisted).toMatchObject({
      status: 'complete',
      pageType: 'offer',
      summary: 'A public Haval H6 drive-away offer.',
      contentHash: payload.contentHash,
      featureKey: 'site_intelligence_enrichment'
    })
    expect(JSON.stringify(persisted)).not.toContain('Public offer copy')
    expect(mockReadSnapshot).toHaveBeenCalledWith(context.r2_object_key, requestEvent)
    expect(mockUpsertVector).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: payload.clientId,
        pageId: payload.pageId,
        contentHash: payload.contentHash
      }),
      requestEvent
    )
  })

  it('records terminal schema failures without retrying or replacing deterministic facts', async () => {
    mockComplete.mockResolvedValue('{"summary":"missing required fields"}')

    const result = await enrichSiteIntelligencePage(payload, requestEvent)

    expect(result).toEqual({ status: 'failed_validation' })
    const persisted = JSON.parse(mockQueryOne.mock.calls[1]?.[1]?.[3] as string)
    expect(persisted).toEqual(expect.objectContaining({
      status: 'failed_validation',
      contentHash: payload.contentHash
    }))
    expect(mockUpsertVector).not.toHaveBeenCalled()
  })

  it('throws transient provider failures so Cloudflare Queue can retry', async () => {
    mockComplete.mockRejectedValue(new Error('provider unavailable'))
    await expect(enrichSiteIntelligencePage(payload, requestEvent)).rejects.toThrow('provider unavailable')
    expect(mockQueryOne).toHaveBeenCalledTimes(1)
  })

  it('acks an already-enriched current hash without repeating storage, model, or vector work', async () => {
    mockQueryOne.mockReset().mockResolvedValue({
      ...context,
      vector_id: payload.pageId,
      ai_enrichment: {
        status: 'complete',
        contentHash: payload.contentHash,
        pageType: 'offer',
        summary: 'Already enriched.',
        offerSummary: null,
        themes: ['offer'],
        confidence: 0.9,
        evidenceFields: ['driveAwayPrice']
      }
    })

    await expect(enrichSiteIntelligencePage(payload, requestEvent)).resolves.toEqual({ status: 'skipped' })
    expect(mockReadSnapshot).not.toHaveBeenCalled()
    expect(mockComplete).not.toHaveBeenCalled()
    expect(mockUpsertVector).not.toHaveBeenCalled()
  })
})
