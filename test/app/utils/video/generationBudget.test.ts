import { describe, expect, it } from 'vitest'
import { generationBudgetNotice, generationBudgetSummary, isGenerationBudgetStatus } from '~~/app/utils/video/generationBudget'

const budget = {
  capCents: 1000,
  committedCents: 2350,
  availableCents: 0,
  reported: { jobs: 0, cents: 0 },
  reserved: { jobs: 0, cents: 0 },
  uncertain: { jobs: 13, cents: 2350 }
}

describe('generationBudgetNotice', () => {
  it('explains unconfirmed historical liability without calling it a charge', () => {
    const notice = generationBudgetNotice(budget, 150)!
    expect(notice.title).toBe('Not enough generation budget for this request')
    expect(notice.description).toContain('$0.00 of the $10.00 generation limit is available; this request is estimated at $1.50.')
    expect(notice.description).toContain('$23.50 is held for 13 earlier jobs whose provider charges have not been confirmed.')
    expect(notice.description).toContain('This is not a confirmed charge')
    expect(notice.description).toContain('an administrator reconciles those jobs or changes the limit')
  })
  it('stays silent when the estimate fits, and handles in-progress reservations and singular wording', () => {
    expect(generationBudgetNotice({ ...budget, availableCents: 500, uncertain: { jobs: 0, cents: 0 } }, 150)).toBeNull()
    expect(generationBudgetNotice(null, 150)).toBeNull()
    const reserved = generationBudgetNotice({ ...budget, availableCents: 100, uncertain: { jobs: 0, cents: 0 }, reserved: { jobs: 2, cents: 900 } }, 150)!
    expect(reserved.description).toContain('$9.00 is reserved for requests that are still in progress.')
    expect(generationBudgetNotice({ ...budget, uncertain: { jobs: 1, cents: 180 } }, 150)!.description).toContain('held for 1 earlier job whose')
  })
  it('summarises availability for the cost tooltip and validates payloads', () => {
    expect(generationBudgetSummary(budget)).toBe(' · $0.00 of $10.00 available, $23.50 unconfirmed')
    expect(generationBudgetSummary(null)).toBe('')
    expect(isGenerationBudgetStatus(budget)).toBe(true)
    expect(isGenerationBudgetStatus({ capCents: 1 })).toBe(false)
    expect(isGenerationBudgetStatus(null)).toBe(false)
  })
})
