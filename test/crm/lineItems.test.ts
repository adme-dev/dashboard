import { describe, it, expect } from 'vitest'
import { lineTotal, sumLineTotals, deriveOppValue } from '~~/server/utils/crm/lineItems'

describe('lineTotal', () => {
  it('multiplies and rounds to 2dp', () => {
    expect(lineTotal(3, 10)).toBe(30)
    expect(lineTotal(2, 9.999)).toBe(20)
    expect(lineTotal(1.5, 10.1)).toBe(15.15)
  })
  it('coerces junk to 0', () => {
    expect(lineTotal(NaN as any, 10)).toBe(0)
    expect(lineTotal(2, undefined as any)).toBe(0)
  })
})

describe('sumLineTotals', () => {
  it('sums line totals', () => {
    expect(sumLineTotals([{ quantity: 2, unit_price: 50 }, { quantity: 1, unit_price: 25 }])).toBe(125)
    expect(sumLineTotals([])).toBe(0)
  })
})

describe('deriveOppValue', () => {
  it('derives from items when present', () => {
    expect(deriveOppValue([{ quantity: 2, unit_price: 100 }], 999)).toBe(200)
  })
  it('keeps the manual amount when there are no items', () => {
    expect(deriveOppValue([], 999)).toBe(999)
    expect(deriveOppValue([], null)).toBeNull()
  })
})
