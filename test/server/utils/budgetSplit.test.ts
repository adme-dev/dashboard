import { describe, it, expect } from 'vitest'
import { splitDailyBudget } from '~~/server/utils/budgetSplit'

describe('splitDailyBudget', () => {
  it('splits equally when current budgets are equal', () => {
    const r = splitDailyBudget([{ id: 'a', currentDailyMajor: 10 }, { id: 'b', currentDailyMajor: 10 }], 100, 1)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.splits).toEqual([{ id: 'a', newDailyMajor: 50 }, { id: 'b', newDailyMajor: 50 }])
    }
  })

  it('splits proportionally to current budget share', () => {
    const r = splitDailyBudget([{ id: 'a', currentDailyMajor: 30 }, { id: 'b', currentDailyMajor: 10 }], 80, 1)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.splits).toEqual([{ id: 'a', newDailyMajor: 60 }, { id: 'b', newDailyMajor: 20 }])
  })

  it('assigns rounding drift to the largest-current ad set so parts sum exactly to the total', () => {
    const r = splitDailyBudget(
      [{ id: 'a', currentDailyMajor: 50 }, { id: 'b', currentDailyMajor: 25 }, { id: 'c', currentDailyMajor: 25 }],
      100, 1,
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      const sum = r.splits.reduce((s, x) => s + x.newDailyMajor, 0)
      expect(Math.round(sum * 100) / 100).toBe(100)
      // largest-current ('a') absorbs the drift
      expect(r.splits.find(s => s.id === 'a')!.newDailyMajor).toBeCloseTo(50, 2)
    }
  })

  it('blocks when any proportional share falls below the per-ad-set minimum', () => {
    const r = splitDailyBudget([{ id: 'a', currentDailyMajor: 100 }, { id: 'b', currentDailyMajor: 1 }], 20, 5)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('adset_share_below_min')
  })

  it('blocks when the total current budget is zero (cannot weight)', () => {
    const r = splitDailyBudget([{ id: 'a', currentDailyMajor: 0 }, { id: 'b', currentDailyMajor: 0 }], 20, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('zero_current_total')
  })

  it('blocks when there are no participants', () => {
    const r = splitDailyBudget([], 20, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no_participants')
  })
})
