import { describe, it, expect } from 'vitest'
import { decideExecution, type ExecutionContext } from '~~/server/utils/budgetExecution'

const ctx: ExecutionContext = {
  platform: 'meta',
  flagEnabled: true,
  currentDaily: 100,
  recommendedDaily: 200,
  platformMinimum: 5,
  maxMultiple: 2,
  monthlyBudget: 0, mtdSpend: 0, monthDaysRemaining: 15, monthlyMarginPct: 0.1,
  alreadyAppliedToday: false,
  override: false,
}

describe('decideExecution', () => {
  it('rejects when the platform flag is off', () => {
    const d = decideExecution({ ...ctx, flagEnabled: false })
    expect(d.proceed).toBe(false)
    expect(d.reason).toBe('writes_disabled')
  })
  it('clamps +100% to +20% and proceeds', () => {
    const d = decideExecution(ctx)
    expect(d.proceed).toBe(true)
    expect(d.finalDaily).toBe(120)
    expect(d.clamped).toBe(true)
  })
  it('does not proceed when blocked by rate limit', () => {
    const d = decideExecution({ ...ctx, alreadyAppliedToday: true })
    expect(d.proceed).toBe(false)
    expect(d.reason).toBe('rate_limited_today')
  })
})
