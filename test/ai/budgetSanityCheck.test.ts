import { describe, it, expect, vi } from 'vitest'
import { buildSanityPrompt, parseSanityResult, sanityCheckBudgetChange, type BudgetChangeForCheck } from '~~/server/utils/ai/budgetSanityCheck'

const change: BudgetChangeForCheck = {
  campaignName: 'Acme Retargeting', platform: 'meta',
  currentDailyBudget: 50, newDailyBudget: 60, pctChange: 20,
}

describe('buildSanityPrompt', () => {
  it('includes the campaign, current/proposed budgets, and % change', () => {
    const p = buildSanityPrompt(change)
    expect(p).toContain('Acme Retargeting')
    expect(p).toContain('Current daily budget: 50')
    expect(p).toContain('Proposed daily budget: 60 (+20%)')
  })

  it('flags a from-$0 turn-on instead of a meaningless 0% (pctChange null)', () => {
    const p = buildSanityPrompt({ ...change, currentDailyBudget: 0, newDailyBudget: 5000, pctChange: null })
    expect(p).toContain('turning on spend from $0')
    expect(p).not.toContain('+0%')
  })
})

describe('parseSanityResult', () => {
  it('parses an explicit unsafe verdict with a concern', () => {
    expect(parseSanityResult('{"sane": false, "concern": "10x jump looks like a typo"}'))
      .toEqual({ sane: false, concern: '10x jump looks like a typo' })
  })
  it('parses a sane verdict (wrapped in prose)', () => {
    expect(parseSanityResult('Sure: {"sane": true, "concern": ""}')).toEqual({ sane: true, concern: null })
  })
  it('fails OPEN on malformed output (never wrongly blocks)', () => {
    expect(parseSanityResult('not json')).toEqual({ sane: true, concern: null })
    expect(parseSanityResult('')).toEqual({ sane: true, concern: null })
  })
})

describe('sanityCheckBudgetChange', () => {
  it('returns the parsed verdict from the injected model', async () => {
    const complete = vi.fn().mockResolvedValue('{"sane": false, "concern": "raising an overpacing campaign"}')
    expect(await sanityCheckBudgetChange({ ...change, issueType: 'overpacing' }, { complete }))
      .toEqual({ sane: false, concern: 'raising an overpacing campaign' })
  })
  it('fails OPEN when the model throws (advisory, never blocks)', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('model down'))
    expect(await sanityCheckBudgetChange(change, { complete })).toEqual({ sane: true, concern: null })
  })
})
