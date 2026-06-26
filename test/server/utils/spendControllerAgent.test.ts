import { describe, expect, it } from 'vitest'

import {
  createSpendControllerReadOnlyResponse,
  normalizedSpendControllerDailyBudget,
  type SpendControllerPacingInput,
} from '~~/server/utils/ai/spendControllerAgent'

function review(overrides: Partial<SpendControllerPacingInput> = {}): SpendControllerPacingInput {
  return {
    period: '2026-06',
    generatedAt: '2026-06-26T00:00:00.000Z',
    summary: {
      criticalCount: 1,
      warningCount: 1,
      infoCount: 0,
      staleCount: 1,
      projectedOverspend: 750,
      projectedUnderspend: 200,
    },
    items: [
      {
        mediaSpendId: 'spend-1',
        clientName: 'Acme',
        platform: 'meta',
        campaignId: 'camp-1',
        campaignName: 'Lead Gen',
        issueType: 'overpacing',
        severity: 'critical',
        budget: 3000,
        mtdSpend: 2400,
        expectedToDate: 1800,
        projectedMonthEnd: 3750,
        currentDailyBudget: 120,
        recommendedDailyBudget: 90,
        syncedAt: '2026-06-26T00:00:00.000Z',
        recommendedAction: 'Review delivery and reduce daily budget.',
      },
      {
        mediaSpendId: 'spend-2',
        clientName: 'Bravo',
        platform: 'google',
        campaignId: 'camp-2',
        campaignName: 'Search',
        issueType: 'stale_sync',
        severity: 'warning',
        budget: 1000,
        mtdSpend: 100,
        expectedToDate: 800,
        projectedMonthEnd: 200,
        currentDailyBudget: 30,
        recommendedDailyBudget: 0,
        syncedAt: '2026-06-20T00:00:00.000Z',
        recommendedAction: 'Sync spend before acting.',
      },
    ],
    ...overrides,
  }
}

describe('spend controller agent response builder', () => {
  it('prioritizes critical pacing issues and blocks direct actions in read-only mode', () => {
    const result = createSpendControllerReadOnlyResponse({
      prompt: 'What needs attention?',
      review: review(),
    })

    expect(result.mode).toBe('read_only')
    expect(result.answer).toContain('1 critical')
    expect(result.findings[0]).toMatchObject({
      severity: 'critical',
      title: 'Acme / Lead Gen is overpacing',
      featureKey: 'agent_spend_controller',
    })
    expect(result.findings[0].sourceRefs[0]).toEqual({
      type: 'media_spend',
      id: 'spend-1',
      label: 'Lead Gen',
    })
    expect(result.proposedActions).toEqual([])
    expect(result.recommendedActions).toContain('Review critical and warning pacing issues before changing budgets.')
    expect(result.recommendedActions).toContain('Sync stale platform data before accepting any budget recommendation.')
  })

  it('returns a no-action-needed answer when pacing review has no findings', () => {
    const result = createSpendControllerReadOnlyResponse({
      prompt: 'Any issues?',
      review: review({
        summary: {
          criticalCount: 0,
          warningCount: 0,
          infoCount: 0,
          staleCount: 0,
          projectedOverspend: 0,
          projectedUnderspend: 0,
        },
        items: [],
      }),
    })

    expect(result.answer).toContain('No pacing issues')
    expect(result.findings).toEqual([])
    expect(result.audit).toMatchObject({
      modelFeatureKey: 'agent_spend_controller',
      mode: 'read_only',
      blockedActionCount: 0,
    })
  })

  it('normalizes negative overpacing budgets to zero for platform action plans', () => {
    expect(normalizedSpendControllerDailyBudget({ recommendedDailyBudget: -70.25 })).toBe(0)
    expect(normalizedSpendControllerDailyBudget({ recommendedDailyBudget: 82.347 })).toBe(82.35)
  })
})
