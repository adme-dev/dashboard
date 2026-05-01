import { describe, it, expect } from 'vitest'
import { buildFingerprint } from '~~/server/utils/anomalyDetection/fingerprints'

describe('buildFingerprint', () => {
  it('returns the bare type+subkey when subkey is simple', () => {
    expect(buildFingerprint('profitability', 'net-loss')).toBe('profitability:net-loss')
  })

  it('lowercases and slug-safes the subkey', () => {
    expect(buildFingerprint('expenses', 'Vendor Outlier: Stripe Inc.'))
      .toBe('expenses:vendor-outlier-stripe-inc')
  })

  it('truncates long subkeys to 80 chars to keep the fingerprint readable', () => {
    const long = 'x'.repeat(200)
    const fp = buildFingerprint('expenses', long)
    expect(fp.length).toBeLessThanOrEqual(80 + 'expenses:'.length)
  })

  it('is stable: same inputs → same output', () => {
    const a = buildFingerprint('cashflow', 'overdraft:Main Account')
    const b = buildFingerprint('cashflow', 'overdraft:Main Account')
    expect(a).toBe(b)
  })

  it('is collision-resistant for two different subkeys', () => {
    const a = buildFingerprint('expenses', 'Stripe')
    const b = buildFingerprint('expenses', 'stripe-payments')
    expect(a).not.toBe(b)
  })
})
