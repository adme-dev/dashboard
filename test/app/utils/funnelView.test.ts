import { describe, it, expect } from 'vitest'
import { pctDelta, conversionRate, shareOfTotal, bestWorstCostPerLead } from '~~/app/utils/funnelView'

describe('pctDelta', () => {
  it('computes percentage change', () => {
    expect(pctDelta(120, 100)).toBeCloseTo(20)
    expect(pctDelta(80, 100)).toBeCloseTo(-20)
  })
  it('returns null when prev is 0, null or undefined', () => {
    expect(pctDelta(50, 0)).toBeNull()
    expect(pctDelta(50, null)).toBeNull()
    expect(pctDelta(null, 100)).toBeNull()
    expect(pctDelta(50, undefined)).toBeNull()
  })
})

describe('conversionRate', () => {
  it('returns a percentage', () => {
    expect(conversionRate(40, 2000)).toBeCloseTo(2)
    expect(conversionRate(80, 2000)).toBeCloseTo(4)
  })
  it('returns null when denominator is 0', () => {
    expect(conversionRate(40, 0)).toBeNull()
  })
})

describe('shareOfTotal', () => {
  it('returns a 0..1 fraction', () => {
    expect(shareOfTotal(25, 100)).toBeCloseTo(0.25)
  })
  it('clamps to [0,1] and guards divide-by-zero', () => {
    expect(shareOfTotal(50, 0)).toBe(0)
    expect(shareOfTotal(150, 100)).toBe(1)
    expect(shareOfTotal(-5, 100)).toBe(0)
  })
})

describe('bestWorstCostPerLead', () => {
  it('picks lowest as best and highest as worst, ignoring null cost/lead', () => {
    const rows = [
      { channel: 'Paid Search', costPerLead: 25 },
      { channel: 'Paid Social', costPerLead: 12 },
      { channel: 'Organic Search', costPerLead: null },
      { channel: 'Other', costPerLead: 40 }
    ]
    expect(bestWorstCostPerLead(rows)).toEqual({ best: 'Paid Social', worst: 'Other' })
  })
  it('returns nulls when fewer than two channels have a cost/lead', () => {
    expect(bestWorstCostPerLead([{ channel: 'A', costPerLead: 10 }])).toEqual({ best: null, worst: null })
    expect(bestWorstCostPerLead([{ channel: 'A', costPerLead: null }])).toEqual({ best: null, worst: null })
  })
})
