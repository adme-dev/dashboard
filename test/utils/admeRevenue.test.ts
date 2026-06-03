import { describe, it, expect } from 'vitest'
import {
  classifyCode,
  computeAdmeRevenue,
  DEFAULT_ADME_RULES,
  type AdmeRevenueRules,
} from '~~/server/utils/admeRevenue'

// Pure ADME net-revenue calculator. These cover the CLASSIFICATION + MARGIN
// MECHANICS (given a rule set, the maths is correct). They deliberately do NOT
// assert the business keep-rates are "right" — those rates are disputed (PDF
// 16/33 vs coa-map 10/0/100) and must be confirmed by the owner + reconciled
// against a real month before being trusted.

describe('classifyCode', () => {
  it('maps known codes to their bucket', () => {
    expect(classifyCode('220').bucket).toBe('media')
    expect(classifyCode('205').bucket).toBe('printing')
    expect(classifyCode('210').bucket).toBe('owned')
  })
  it('flags unmapped codes and routes them to the default bucket', () => {
    const c = classifyCode('999')
    expect(c.unmapped).toBe(true)
    expect(c.bucket).toBe(DEFAULT_ADME_RULES.defaultBucket)
  })
})

describe('computeAdmeRevenue', () => {
  // A rule set with simple, explicit rates so the maths is easy to verify.
  const rules: AdmeRevenueRules = {
    bucketByCode: { '220': 'media', '205': 'printing', '210': 'owned', '330': 'excluded' },
    keepByBucket: { media: 0.16, printing: 0.33, owned: 1, excluded: 0 },
    defaultBucket: 'owned',
  }

  it('computes per-bucket contributions and the ADME margin', () => {
    const r = computeAdmeRevenue([
      { code: '210', exGst: 100000, gst: 10000 }, // owned 100% → 100000
      { code: '220', exGst: 50000, gst: 5000 },   // media 16%  → 8000
      { code: '205', exGst: 10000, gst: 1000 },   // printing 33% → 3300
      { code: '330', exGst: 157000, gst: 0 },     // passthrough 0% → 0
    ], rules)

    expect(r.byBucket.owned.contribution).toBe(100000)
    expect(r.byBucket.media.contribution).toBe(8000)
    expect(r.byBucket.printing.contribution).toBe(3300)
    expect(r.byBucket.excluded.contribution).toBe(0)
    expect(r.admeMargin).toBe(111300)
  })

  it('reports gross ex-GST, GST and gross incl-GST', () => {
    const r = computeAdmeRevenue([
      { code: '210', exGst: 100, gst: 10 },
      { code: '220', exGst: 50, gst: 5 },
    ], rules)
    expect(r.grossExGst).toBe(150)
    expect(r.gst).toBe(15)
    expect(r.grossInclGst).toBe(165)
  })

  it('demonstrates gross ≫ margin when passthrough dominates (the core problem)', () => {
    // Mirrors the real shape: ~$342k gross, but most is 0%-margin passthrough.
    const r = computeAdmeRevenue([
      { code: '210', exGst: 153765 },             // owned 100%
      { code: '330', exGst: 157149, gst: 0 },     // passthrough 0%
      { code: '220', exGst: 26691, gst: 2669 },   // media 16% → 4270.56
    ], rules)
    expect(r.grossExGst).toBeCloseTo(337605, 0)
    expect(r.admeMargin).toBeCloseTo(153765 + 0 + 26691 * 0.16, 0)
    expect(r.admeMargin).toBeLessThan(r.grossExGst * 0.6) // margin ≪ gross
  })

  it('sorts byCode by ex-GST descending and preserves bucket labels', () => {
    const r = computeAdmeRevenue([
      { code: '220', exGst: 10 },
      { code: '210', exGst: 100 },
    ], rules)
    expect(r.byCode[0]!.code).toBe('210')
    expect(r.byCode[0]!.bucket).toBe('owned')
  })

  it('handles an empty invoice set', () => {
    const r = computeAdmeRevenue([])
    expect(r.admeMargin).toBe(0)
    expect(r.grossExGst).toBe(0)
  })
})
