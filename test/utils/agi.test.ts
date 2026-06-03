import { describe, it, expect } from 'vitest'
import { buildAgiSeries, DEFAULT_DIRECT_COST_CODES } from '~~/server/utils/agi'

// AGI = Revenue − Direct Costs, with trailing averages over COMPLETE months.

const raw = [
  { mon: '2026-01', revenueCents: 200_000_00, directCostCents: 80_000_00 }, // agi 120k, 60%
  { mon: '2026-02', revenueCents: 300_000_00, directCostCents: 120_000_00 }, // agi 180k, 60%
  { mon: '2026-03', revenueCents: 100_000_00, directCostCents: 40_000_00 }, // agi 60k, 60%
  { mon: '2026-04', revenueCents: 50_000_00, directCostCents: 30_000_00 }, // agi 20k, 40% (partial/current)
]

describe('buildAgiSeries', () => {
  it('computes AGI and margin per month', () => {
    const s = buildAgiSeries(raw)
    expect(s.months[0]).toMatchObject({ mon: '2026-01', revenue: 200000, directCost: 80000, agi: 120000, marginPct: 60 })
    expect(s.months[2]!.agi).toBe(60000)
  })

  it('current is the latest month', () => {
    const s = buildAgiSeries(raw, { currentMon: '2026-04' })
    expect(s.current!.mon).toBe('2026-04')
    expect(s.current!.marginPct).toBe(40)
  })

  it('excludes the current/partial month from trailing averages', () => {
    const s = buildAgiSeries(raw, { currentMon: '2026-04' })
    // trailing3 = Jan/Feb/Mar only: agi 120k+180k+60k = 360k / 3 = 120k
    expect(s.trailing3.months).toBe(3)
    expect(s.trailing3.avgAgi).toBe(120000)
    expect(s.trailing3.avgMarginPct).toBe(60) // 360k / 600k revenue
  })

  it('includes all months in trailing when none flagged current', () => {
    const s = buildAgiSeries(raw)
    expect(s.trailing3.months).toBe(3) // last 3: Feb/Mar/Apr
  })

  it('trailing12 totals revenue/cost/agi over complete months', () => {
    const s = buildAgiSeries(raw, { currentMon: '2026-04' })
    expect(s.trailing12.totalRevenue).toBe(600000)
    expect(s.trailing12.totalDirectCost).toBe(240000)
    expect(s.trailing12.totalAgi).toBe(360000)
    expect(s.trailing12.months).toBe(3)
  })

  it('handles zero revenue (null margin, no divide-by-zero)', () => {
    const s = buildAgiSeries([{ mon: '2026-01', revenueCents: 0, directCostCents: 0 }])
    expect(s.months[0]!.marginPct).toBeNull()
  })

  it('sorts unordered input', () => {
    const s = buildAgiSeries([raw[2]!, raw[0]!, raw[1]!])
    expect(s.months.map(m => m.mon)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('exposes the default DIRECTCOSTS code set', () => {
    expect(DEFAULT_DIRECT_COST_CODES).toContain('330')
    expect(DEFAULT_DIRECT_COST_CODES).toContain('320')
    expect(DEFAULT_DIRECT_COST_CODES).not.toContain('477') // wages = overhead, not direct cost
  })

  it('returns empty-safe summary for no data', () => {
    const s = buildAgiSeries([])
    expect(s.current).toBeNull()
    expect(s.trailing12.avgAgi).toBe(0)
  })
})
