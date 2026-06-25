import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockGenerateGroqInsight = vi.fn()
const mockProposeAction = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    REASONING_20B: 'openai/gpt-oss-20b',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

vi.mock('~~/server/utils/socialSpendPacingReview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/socialSpendPacingReview')>()
  return {
    ...actual,
    buildPacingReview: () => ({
      items: [
        {
          mediaSpendId: 'media-spend-1',
          campaignName: 'Acme Retargeting',
          clientName: 'Acme',
          platform: 'meta',
          currentDailyBudget: 50,
          issueType: 'overpacing',
        },
      ],
    }),
  }
})

vi.mock('~~/server/utils/ai/pendingActions', () => ({
  proposeAction: (...args: unknown[]) => mockProposeAction(...args),
}))

const { proposeBudgetChange } = await import('~~/server/utils/ai/tools/proposeBudgetChange')

describe('proposeBudgetChange Model Ops telemetry', () => {
  beforeEach(() => {
    mockQueryRows.mockReset().mockResolvedValue([])
    mockGenerateGroqInsight.mockReset().mockResolvedValue('{"sane":false,"concern":"Large increase while overpacing."}')
    mockProposeAction.mockReset().mockResolvedValue('proposal-1')
  })

  it('records explicit metadata for the default budget sanity check model call', async () => {
    const result = await proposeBudgetChange(
      { campaignName: 'Acme Retargeting', newDailyBudget: 500, clientName: 'Acme', reason: 'Need more volume' },
      { userId: 'user-1', userRole: 'media_buyer', conversationId: 'conversation-1', event: { headers: {} } as any },
    )

    expect(result.ok).toBe(true)
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(expect.stringContaining('Acme Retargeting'), expect.objectContaining({
      model: 'openai/gpt-oss-20b',
      featureKey: 'budget_change_sanity_check',
      requestId: 'Acme Retargeting',
      metadata: {
        route: 'proposeBudgetChange.sanityCheck',
        toolName: 'propose_budget_change',
        campaignNameChars: 16,
        platform: 'meta',
        currentDailyBudget: 50,
        newDailyBudget: 500,
        pctChange: 900,
        issueType: 'overpacing',
        isFromZero: false,
      },
    }))
    expect(mockProposeAction).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conversation-1' }),
      'conversation-1',
      'propose_budget_change',
      expect.objectContaining({
        sanityCheck: { sane: false, concern: 'Large increase while overpacing.' },
      }),
    )
  })
})
