import { describe, it, expect } from 'vitest'
import { splitInvoiceTotals } from '~~/server/utils/getOutInvoiceTotals'

// Splits a month's Xero invoices into GST-inclusive / ex-GST / GST components.
// The "Get Out" target is a cash obligation (ex-GST); measuring it against the
// gross incl-GST total overstates coverage by the GST portion. Pure — covers
// the real-field path, the GST-free path, and every fallback rung.

describe('splitInvoiceTotals', () => {
  it('uses real subTotal/totalTax when present', () => {
    const r = splitInvoiceTotals([
      { total: 110, subTotal: 100, totalTax: 10 },
      { total: 55, subTotal: 50, totalTax: 5 },
    ])
    expect(r.inclGst).toBe(165)
    expect(r.exGst).toBe(150)
    expect(r.gst).toBe(15)
  })

  it('handles GST-free invoices (totalTax = 0)', () => {
    const r = splitInvoiceTotals([{ total: 100, subTotal: 100, totalTax: 0 }])
    expect(r.inclGst).toBe(100)
    expect(r.exGst).toBe(100)
    expect(r.gst).toBe(0)
  })

  it('derives exGst from total - totalTax when subTotal is missing', () => {
    const r = splitInvoiceTotals([{ total: 110, totalTax: 10 }])
    expect(r.exGst).toBe(100)
    expect(r.gst).toBe(10)
  })

  it('derives gst from total - subTotal when totalTax is missing', () => {
    const r = splitInvoiceTotals([{ total: 110, subTotal: 100 }])
    expect(r.exGst).toBe(100)
    expect(r.gst).toBe(10)
  })

  it('falls back to the AU 1/11 assumption when only total is present', () => {
    const r = splitInvoiceTotals([{ total: 110 }])
    expect(r.inclGst).toBe(110)
    expect(r.exGst).toBeCloseTo(100, 5)   // 110 / 1.1
    expect(r.gst).toBeCloseTo(10, 5)      // 110 / 11
  })

  it('coerces string/garbage numerics safely', () => {
    const r = splitInvoiceTotals([
      { total: '110', subTotal: '100', totalTax: '10' },
      { total: null as any },
      {} as any,
    ])
    expect(r.inclGst).toBe(110)
    expect(r.exGst).toBe(100)
    expect(r.gst).toBe(10)
  })

  it('returns zeros for an empty array', () => {
    expect(splitInvoiceTotals([])).toEqual({ inclGst: 0, exGst: 0, gst: 0 })
  })

  it('keeps exGst + gst reconciled to inclGst on the fallback path', () => {
    const r = splitInvoiceTotals([{ total: 110 }])
    expect(r.exGst + r.gst).toBeCloseTo(r.inclGst, 5)
  })
})
