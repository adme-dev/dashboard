import { describe, expect, it, vi } from 'vitest'

import { createSyncBudget, normaliseSyncMaxMs, withSyncTimeout } from '~~/server/utils/socialInbox/syncBudget'

describe('social inbox sync budget', () => {
  it('rejects provider work that exceeds its timeout', async () => {
    vi.useFakeTimers()
    try {
      const pending = withSyncTimeout(new Promise(() => {}), 25, 'facebook:comment')
      const expectation = expect(pending).rejects.toThrow('facebook:comment timed out after 25ms')

      await vi.advanceTimersByTimeAsync(25)

      await expectation
    } finally {
      vi.useRealTimers()
    }
  })

  it('clamps caller-provided run budgets', () => {
    expect(normaliseSyncMaxMs(2_000, 45_000)).toBe(5_000)
    expect(normaliseSyncMaxMs(120_000, 45_000)).toBe(100_000)
    expect(normaliseSyncMaxMs(null, 45_000)).toBe(45_000)
  })

  it('calculates remaining time for the next provider without exhausting the response budget', () => {
    let now = 1_000
    const budget = createSyncBudget(10_000, () => now)

    now = 4_000

    expect(budget.remainingMs()).toBe(7_000)
    expect(budget.timeoutFor(12_000, 1_000)).toBe(6_000)
    expect(budget.expired(6_999)).toBe(false)
    expect(budget.expired(7_000)).toBe(true)
  })
})
