import { describe, expect, it } from 'vitest'
import { extractAutomotiveFacts } from '~~/server/utils/siteIntelligence/extractAutomotiveFacts'

describe('extractAutomotiveFacts', () => {
  it('extracts exact automotive offer and finance facts with short evidence', () => {
    const markdown = `
      # 2026 GWM Haval H6 Ultra Hybrid
      New vehicle in stock.
      Special drive-away offer $44,990 drive away.
      Finance from $189 per week at 6.99% comparison rate over 60 months.
      Offer ends 31 August 2026. Australian residents 18+ only.
      [Book a test drive](/test-drive) [Get a quote](/quote)
      *Terms and conditions apply. Fees, charges and lending criteria apply.
    `

    const result = extractAutomotiveFacts(markdown, {
      url: 'https://dealer.example.com/offers/haval-h6?utm_source=paid#hero',
      title: 'Haval H6 Offer',
      jsonLd: {
        '@type': 'Vehicle',
        'brand': { '@type': 'Brand', 'name': 'GWM' },
        'model': 'Haval H6',
        'vehicleConfiguration': 'Ultra Hybrid',
        'vehicleModelDate': '2026',
        'offers': {
          '@type': 'Offer',
          'price': '42990',
          'priceCurrency': 'AUD',
          'availability': 'https://schema.org/InStock'
        }
      }
    })

    expect(result.extractionVersion).toBe('automotive-deterministic-v1')
    expect(result.canonicalUrl).toBe('https://dealer.example.com/offers/haval-h6')
    expect(result.facts).toEqual({
      pageType: 'offer',
      brand: 'GWM',
      model: 'Haval H6',
      variant: 'Ultra Hybrid',
      bodyType: null,
      powertrain: 'hybrid',
      modelYear: 2026,
      stockState: 'in_stock',
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
        eligibility: 'Australian residents 18+ only'
      },
      expiry: '2026-08-31',
      ctas: ['get_quote', 'test_drive'],
      disclaimers: ['Terms and conditions apply. Fees, charges and lending criteria apply.']
    })
    expect(result.evidence).toEqual(expect.arrayContaining([
      { field: 'driveAwayPrice', excerpt: '$42,990' },
      { field: 'finance.comparisonRate', excerpt: '6.99% comparison rate' },
      { field: 'expiry', excerpt: 'Offer ends 31 August 2026' },
      { field: 'ctas', excerpt: 'Book a test drive' }
    ]))
    expect(result.evidence.every(item => item.excerpt.length <= 240)).toBe(true)
  })

  it('leaves absent or ambiguous values null instead of inventing facts', () => {
    const result = extractAutomotiveFacts(
      '# Explore the GWM range\nOffers may be available. Contact us for details.',
      { url: 'https://dealer.example.com/range' }
    )

    expect(result.facts.driveAwayPrice).toBeNull()
    expect(result.facts.finance.repayment).toBeNull()
    expect(result.facts.finance.comparisonRate).toBeNull()
    expect(result.facts.finance.termMonths).toBeNull()
    expect(result.facts.expiry).toBeNull()
    expect(result.facts.stockState).toBeNull()
    expect(result.facts.variant).toBeNull()
  })
})
