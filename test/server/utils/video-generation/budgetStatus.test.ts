import { describe, expect, it } from 'vitest'
import { summarizeVideoGenerationBudget } from '~~/server/utils/video-generation/budgetStatus'

describe('summarizeVideoGenerationBudget', () => {
  it('sums every counted state and never reports negative availability', () => {
    expect(summarizeVideoGenerationBudget({ monthlyCapCents: 1000 }, [
      { liability_state: 'uncertain', jobs: '13', cents: '2350' },
      { liability_state: 'reserved', jobs: 1, cents: 40 }
    ])).toEqual({
      capCents: 1000,
      committedCents: 2390,
      availableCents: 0,
      reported: { jobs: 0, cents: 0 },
      reserved: { jobs: 1, cents: 40 },
      uncertain: { jobs: 13, cents: 2350 }
    })
  })
  it('treats an invalid cap as zero', () => {
    expect(summarizeVideoGenerationBudget({ monthlyCapCents: Number.NaN }, []).capCents).toBe(0)
    expect(summarizeVideoGenerationBudget({ monthlyCapCents: -5 }, []).availableCents).toBe(0)
  })
})
