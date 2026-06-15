import { describe, it, expect } from 'vitest'
import { evaluateBudgetGuardrails, type GuardrailInput } from '~~/server/utils/budgetGuardrails'

const base: GuardrailInput = {
  currentDaily: 100,
  recommendedDaily: 110,
  platformMinimum: 5,
  maxMultiple: 3,
  monthlyBudget: 0,
  mtdSpend: 0,
  monthDaysRemaining: 15,
  monthlyMarginPct: 0.1,
  alreadyAppliedToday: false,
  override: false,
}

describe('evaluateBudgetGuardrails', () => {
  it('passes a within-limits change unchanged', () => {
    const r = evaluateBudgetGuardrails({ ...base, recommendedDaily: 110 })
    expect(r.blocked).toBe(false)
    expect(r.finalDaily).toBe(110)
    expect(r.clamped).toBe(false)
  })

  it('clamps an increase above +20% to +20%', () => {
    const r = evaluateBudgetGuardrails({ ...base, recommendedDaily: 200 })
    expect(r.finalDaily).toBe(120)
    expect(r.clamped).toBe(true)
    expect(r.clampReasons).toContain('learning_phase_+20pct')
  })

  it('clamps a decrease below -20% to -20%', () => {
    const r = evaluateBudgetGuardrails({ ...base, recommendedDaily: 50 })
    expect(r.finalDaily).toBe(80)
    expect(r.clampReasons).toContain('learning_phase_-20pct')
  })

  it('clamps down to the relative max-multiple cap', () => {
    // current 100, +20% step = 120, but maxMultiple 1.1 => cap 110
    const r = evaluateBudgetGuardrails({ ...base, recommendedDaily: 200, maxMultiple: 1.1 })
    expect(r.finalDaily).toBe(110)
    expect(r.clampReasons).toContain('max_multiple')
  })

  it('clamps down to the monthly-budget margin', () => {
    // monthly 3000, spent 2000, +10% margin => 1300 remaining over 10 days = 130/day max
    const r = evaluateBudgetGuardrails({
      ...base, currentDaily: 200, recommendedDaily: 240,
      monthlyBudget: 3000, mtdSpend: 2000, monthDaysRemaining: 10, monthlyMarginPct: 0.1,
    })
    expect(r.finalDaily).toBe(130)
    expect(r.clampReasons).toContain('monthly_margin')
  })

  it('raises up to the platform minimum', () => {
    const r = evaluateBudgetGuardrails({ ...base, currentDaily: 6, recommendedDaily: 4, platformMinimum: 5 })
    expect(r.finalDaily).toBe(5)
    expect(r.clampReasons).toContain('platform_minimum')
  })

  it('blocks when already applied today', () => {
    const r = evaluateBudgetGuardrails({ ...base, alreadyAppliedToday: true })
    expect(r.blocked).toBe(true)
    expect(r.blockReason).toBe('rate_limited_today')
  })

  it('rate-limit blocks even with override', () => {
    const r = evaluateBudgetGuardrails({ ...base, alreadyAppliedToday: true, override: true })
    expect(r.blocked).toBe(true)
  })

  it('blocks when platform minimum exceeds the cap', () => {
    // cap by multiple = 4*1 = 4, but minimum 5 => cannot satisfy both
    const r = evaluateBudgetGuardrails({ ...base, currentDaily: 4, recommendedDaily: 4, maxMultiple: 1, platformMinimum: 5 })
    expect(r.blocked).toBe(true)
    expect(r.blockReason).toBe('minimum_exceeds_cap')
  })

  it('override skips the ±20% clamp and relative cap but not the minimum', () => {
    const r = evaluateBudgetGuardrails({ ...base, recommendedDaily: 500, maxMultiple: 1.1, override: true })
    expect(r.finalDaily).toBe(500)
    expect(r.clamped).toBe(false)
  })

  it('rounds to 2 decimals', () => {
    const r = evaluateBudgetGuardrails({ ...base, currentDaily: 33.33, recommendedDaily: 40 })
    expect(Number.isInteger(r.finalDaily * 100)).toBe(true)
  })
})
