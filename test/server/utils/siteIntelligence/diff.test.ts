import { describe, expect, it } from 'vitest'
import { diffAutomotiveFacts } from '~~/server/utils/siteIntelligence/diff'

const base = {
  pageType: 'offer' as const,
  brand: 'GWM',
  model: 'Haval H6',
  variant: 'Ultra',
  bodyType: 'SUV',
  powertrain: 'hybrid',
  modelYear: 2026,
  stockState: 'in_stock' as const,
  driveAwayPrice: 42990,
  driveAwayPriceDisplay: '$42,990',
  listPrice: null,
  listPriceDisplay: null,
  discount: null,
  discountDisplay: null,
  offerTypes: ['finance', 'price'],
  finance: {
    deposit: null,
    depositDisplay: null,
    repayment: 189,
    repaymentDisplay: '$189 per week',
    repaymentPeriod: 'week',
    comparisonRate: 6.99,
    comparisonRateDisplay: '6.99% comparison rate',
    termMonths: 60,
    termDisplay: '60 months',
    balloon: null,
    balloonDisplay: null,
    eligibility: null
  },
  expiry: '2026-08-31',
  ctas: ['get_quote', 'test_drive'],
  disclaimers: ['Terms apply.']
}

describe('diffAutomotiveFacts', () => {
  it('ignores navigation, cookie, whitespace, and crawl timestamp metadata', () => {
    const result = diffAutomotiveFacts(base, { ...base }, {
      previousEvidence: [{ field: 'navigation', excerpt: 'Models Offers Contact' }],
      currentEvidence: [{ field: 'navigation', excerpt: 'Models   Offers   Contact Cookie settings 2026-08-01T01:02:03Z' }]
    })

    expect(result).toEqual({ material: false, changedFields: [], before: {}, after: {}, evidence: [] })
  })

  it.each([
    ['driveAwayPrice', { driveAwayPrice: 43990, driveAwayPriceDisplay: '$43,990' }],
    ['expiry', { expiry: '2026-09-30' }],
    ['stockState', { stockState: 'used' as const }],
    ['ctas', { ctas: ['get_quote'] }],
    ['offerTypes', { offerTypes: ['factory_bonus'] }]
  ])('marks a %s change as material', (field, patch) => {
    const current = { ...base, ...patch }
    const result = diffAutomotiveFacts(base, current, {
      currentEvidence: [{ field, excerpt: `Current ${field} evidence` }]
    })

    expect(result.material).toBe(true)
    expect(result.changedFields).toContain(field)
    expect(result.evidence).toEqual([{ field, excerpt: `Current ${field} evidence` }])
    expect(Object.keys(result.before)).toEqual([...Object.keys(result.before)].sort())
    expect(Object.keys(result.after)).toEqual([...Object.keys(result.after)].sort())
    expect(JSON.stringify(result)).not.toContain('Models Offers Contact')
  })
})
