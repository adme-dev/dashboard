import { describe, expect, it } from 'vitest'
import {
  budgetHistoryDelta,
  budgetHistoryTone,
  formatBudgetHistoryTime,
  matchingPlannedBudgetAction,
  performanceSignalRows,
  pacingSignalRows,
} from '~~/app/utils/socialSpendHistory'

describe('socialSpendHistory', () => {
  it('calculates budget deltas and tone from audit entries', () => {
    expect(budgetHistoryDelta({ previousBudget: 1200, newBudget: 1500 })).toBe(300)
    expect(budgetHistoryTone({ previousBudget: 1200, newBudget: 1500 })).toBe('increase')
    expect(budgetHistoryTone({ previousBudget: 1500, newBudget: 1200 })).toBe('decrease')
    expect(budgetHistoryTone({ previousBudget: 1200, newBudget: 1200 })).toBe('flat')
  })

  it('formats budget history timestamps in Australian date order', () => {
    expect(formatBudgetHistoryTime('2026-06-10T03:45:00.000Z', 'en-AU', 'UTC')).toBe('10 Jun 2026, 3:45 am')
  })

  it('builds pacing signal rows explaining why a campaign is flagged', () => {
    const rows = pacingSignalRows({
      budget: 3000,
      mtdSpend: 1800,
      expectedToDate: 1000,
      projectedMonthEnd: 5400,
      currentDailyBudget: 100,
      recommendedDailyBudget: 70,
      pacingRatio: 1.8,
      syncedAt: '2026-06-09T23:00:00.000Z',
    }, 'en-AU', 'UTC')

    expect(rows).toEqual([
      { label: 'Pacing ratio', value: '180%', detail: '80% ahead of expected spend' },
      { label: 'Spend vs expected', value: '+$800', detail: '$1,800 spent vs $1,000 expected' },
      { label: 'Projected variance', value: '+$2,400', detail: '$5,400 projected vs $3,000 budget' },
      { label: 'Daily budget change', value: '-$30/day', detail: '$100/day current to $70/day recommended' },
      { label: 'Last synced', value: '9 Jun 2026, 11:00 pm', detail: 'Fresh platform spend reduces recommendation risk' },
    ])
  })

  it('builds performance signal rows from campaign delivery metrics', () => {
    const rows = performanceSignalRows({
      impressions: 12000,
      clicks: 600,
      conversions: 12,
      ctr: 5,
      cpc: 3,
      costPerConversion: 150,
      conversionRate: 2,
      reach: 7500,
      frequency: 1.6,
      impressionShare: 72.5,
      lostImpressionShareBudget: 18.25,
      lostImpressionShareRank: 9.5,
      bidStrategy: 'MAXIMIZE_CONVERSIONS',
      budgetType: 'daily',
    })

    expect(rows).toEqual([
      { label: 'CTR', value: '5.00%', detail: '600 clicks from 12,000 impressions' },
      { label: 'Cost per conversion', value: '$150', detail: '12 conversions at 2.00% conversion rate' },
      { label: 'Reach and frequency', value: '7,500 / 1.60x', detail: 'High frequency can accelerate spend without expanding reach' },
      { label: 'Google impression share lost', value: '18.25% budget / 9.50% rank', detail: 'Budget and rank limits can explain under-delivery' },
      { label: 'Bid and budget setup', value: 'Maximize Conversions / Daily', detail: 'Platform configuration that affects pacing behavior' },
    ])
  })

  it('finds a matching planned budget action for the recommended daily budget', () => {
    const action = matchingPlannedBudgetAction([
      {
        actionType: 'budget_update',
        actionStatus: 'applied',
        newValue: { dailyBudget: 95 },
      },
      {
        actionType: 'budget_update',
        actionStatus: 'planned',
        newValue: { dailyBudget: '95.00' },
      },
    ], 95)

    expect(action).toEqual({
      actionType: 'budget_update',
      actionStatus: 'planned',
      newValue: { dailyBudget: '95.00' },
    })
    expect(matchingPlannedBudgetAction([
      { actionType: 'budget_update', actionStatus: 'planned', newValue: { dailyBudget: 80 } },
    ], 95)).toBeNull()
  })

  it('treats approved budget actions as matching active recommendations', () => {
    const action = matchingPlannedBudgetAction([
      {
        actionType: 'budget_update',
        actionStatus: 'approved',
        newValue: { dailyBudget: '95.00' },
      },
    ], 95)

    expect(action).toEqual({
      actionType: 'budget_update',
      actionStatus: 'approved',
      newValue: { dailyBudget: '95.00' },
    })
  })
})
