import { describe, it, expect } from 'vitest'
import { QrAbSchema, pickVariant, twoProportionTest } from '../../shared/qr/ab'

describe('QrAbSchema', () => {
  it('defaults off with a 50/50 split and validates the B url', () => {
    expect(QrAbSchema.parse({})).toEqual({ enabled: false, variant_b_url: null, split_pct: 50 })
    expect(QrAbSchema.safeParse({ variant_b_url: 'ftp://x' }).success).toBe(false)
    expect(QrAbSchema.safeParse({ split_pct: 101 }).success).toBe(false)
  })
})

describe('pickVariant', () => {
  it('is deterministic for a seed and respects 0 / 100 splits', () => {
    expect(pickVariant('abc', 50)).toBe(pickVariant('abc', 50))
    expect(pickVariant('abc', 0)).toBe('A')
    expect(pickVariant('abc', 100)).toBe('B')
    expect(pickVariant(null, 100, () => 0.99)).toBe('B')
    expect(pickVariant(null, 0, () => 0.01)).toBe('A')
  })
  it('splits roughly by percentage across many seeds', () => {
    let b = 0
    for (let i = 0; i < 2000; i++) if (pickVariant(`seed-${i}`, 30) === 'B') b++
    expect(b / 2000).toBeGreaterThan(0.24)
    expect(b / 2000).toBeLessThan(0.36)
  })
})

describe('twoProportionTest', () => {
  it('withholds a verdict on thin data', () => {
    expect(twoProportionTest({ scans: 10, leads: 2 }, { scans: 10, leads: 5 }).note).toMatch(/30 scans/)
    expect(twoProportionTest({ scans: 100, leads: 2 }, { scans: 100, leads: 20 }).note).toMatch(/5 leads/)
  })
  it('flags a clear winner and stays quiet on equal arms', () => {
    const win = twoProportionTest({ scans: 1000, leads: 100 }, { scans: 1000, leads: 150 })
    expect(win.significant).toBe(true)
    expect(win.winner).toBe('B')
    expect(win.p!).toBeLessThan(0.01)
    expect(win.lift).toBeCloseTo(0.5, 5)
    const tie = twoProportionTest({ scans: 500, leads: 50 }, { scans: 500, leads: 52 })
    expect(tie.significant).toBe(false)
    expect(tie.winner).toBeNull()
  })
})
