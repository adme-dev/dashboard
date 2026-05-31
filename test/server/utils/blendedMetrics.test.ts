import { describe, it, expect } from 'vitest'
import { buildBlended, buildBlendedComparison } from '~~/server/utils/blendedMetrics'

describe('buildBlended', () => {
  const out = buildBlended({
    spendByChannel: { 'Paid Search': 1000, 'Paid Social': 500, 'Organic Search': 0 },
    leadsByChannel: { 'Paid Search': 40, 'Paid Social': 10, 'Organic Search': 5 },
    conversionsByChannel: { 'Paid Search': 50, 'Paid Social': 20 },
    revenueByChannel: { 'Paid Search': 3000 },
    sessionsByChannel: { 'Paid Search': 800, 'Organic Search': 1200 }
  })

  it('blends CPL/CPA/ROAS per canonical channel', () => {
    const ps = out.channels.find(c => c.channel === 'Paid Search')!
    expect(ps.cpl).toBe(25)        // 1000 / 40
    expect(ps.cpa).toBe(20)        // 1000 / 50
    expect(ps.roas).toBe(3)        // 3000 / 1000
    expect(ps.sessions).toBe(800)
  })

  it('returns null ratios when the denominator is 0 (organic / no leads)', () => {
    const organic = out.channels.find(c => c.channel === 'Organic Search')!
    expect(organic.spend).toBe(0)
    expect(organic.cpl).toBeNull()   // no spend
    expect(organic.roas).toBeNull()  // no spend
    expect(organic.sessions).toBe(1200)
  })

  it('totals reconcile as blended (sum spend / sum leads), not an average of ratios', () => {
    expect(out.totals.spend).toBe(1500)
    expect(out.totals.leads).toBe(55)
    expect(out.totals.cpl).toBeCloseTo(1500 / 55)   // blended, not (25 + 50 + null)/n
    expect(out.totals.conversions).toBe(70)
    expect(out.totals.cpa).toBeCloseTo(1500 / 70)
    expect(out.totals.revenue).toBe(3000)
    expect(out.totals.roas).toBe(2)                 // 3000 / 1500
    expect(out.totals.sessions).toBe(2000)
  })

  it('sorts channels by spend descending', () => {
    expect(out.channels[0].channel).toBe('Paid Search')
    expect(out.channels[1].channel).toBe('Paid Social')
  })
})

describe('buildBlendedComparison', () => {
  it('computes fractional deltas, null when previous is 0', () => {
    const curr = buildBlended({ spendByChannel: { x: 110 }, leadsByChannel: { x: 10 }, conversionsByChannel: {}, revenueByChannel: {}, sessionsByChannel: {} }).totals
    const prev = buildBlended({ spendByChannel: { x: 100 }, leadsByChannel: {}, conversionsByChannel: {}, revenueByChannel: {}, sessionsByChannel: {} }).totals
    const cmp = buildBlendedComparison(curr, prev)
    expect(cmp.deltaPct.spend).toBeCloseTo(0.1)   // 110 vs 100
    expect(cmp.deltaPct.leads).toBeNull()         // prev leads = 0
  })
})
