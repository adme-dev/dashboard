import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGenerateGroqInsight = vi.fn()

vi.mock('~~/server/utils/groqClient', () => ({ GROQ_MODELS: { LLAMA_70B: 'llama-3.3-70b-versatile' } }))
vi.mock('~~/server/utils/ai/resolvedGroq', () => ({
  generateModelRoutedGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const { generateReportSummary } = await import('~~/server/utils/socialReporting/aiSummary')

const kpis = {
  posts: { value: 12, deltaPct: 20 },
  impressions: { value: 5000, deltaPct: 10 },
  reach: { value: 4000, deltaPct: -5 },
  engagements: { value: 300, deltaPct: 23 },
  clicks: { value: 80, deltaPct: null },
  engagementRate: { value: 7.5, deltaPct: 12 },
}

describe('generateReportSummary', () => {
  beforeEach(() => {
    mockGenerateGroqInsight.mockReset()
    mockGenerateGroqInsight.mockResolvedValue('  Engagement improved across the period.  ')
  })

  it('passes explicit Model Ops metadata without prompt/output content', async () => {
    const result = await generateReportSummary('Acme', 'May 2026', kpis, {
      source: 'agency',
      userId: 'user-1',
      clientId: 'client-1',
      requestId: 'request-1',
    })

    expect(result).toBe('Engagement improved across the period.')
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Acme'), expect.objectContaining({
      featureKey: 'social_reporting_ai_summary',
      userId: 'user-1',
      clientId: 'client-1',
      requestId: 'request-1',
      maxTokens: 220,
      metadata: {
        source: 'agency',
        periodLabel: 'May 2026',
        postCount: 12,
        hasPriorBaseline: true,
      },
    }))
  })

  it('returns null when Groq returns the shared failure sentinel', async () => {
    mockGenerateGroqInsight.mockResolvedValueOnce('Unable to generate insight')

    await expect(generateReportSummary('Acme', 'May 2026', kpis)).resolves.toBeNull()
  })
})
