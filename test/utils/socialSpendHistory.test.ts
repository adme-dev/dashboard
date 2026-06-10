import { describe, expect, it } from 'vitest'
import {
  budgetHistoryDelta,
  budgetHistoryTone,
  formatBudgetHistoryTime,
  pacingSignalRows,
} from '~/app/utils/socialSpendHistory'

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
})
