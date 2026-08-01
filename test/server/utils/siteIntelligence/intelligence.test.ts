import { describe, expect, it } from 'vitest'
import type { AutomotivePageFacts } from '~~/app/types/site-intelligence'
import {
  compareAutomotiveOffers,
  deriveSiteIntelligenceInsights,
  joinOwnedAudienceContext
} from '~~/server/utils/siteIntelligence/intelligence'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-08-01T04:00:00.000Z')

function facts(patch: Partial<AutomotivePageFacts> = {}): AutomotivePageFacts {
  return {
    pageType: 'model',
    brand: 'GWM',
    model: 'Haval H6',
    variant: null,
    bodyType: 'SUV',
    powertrain: 'hybrid',
    modelYear: 2026,
    stockState: 'in_stock',
    driveAwayPrice: null,
    driveAwayPriceDisplay: null,
    listPrice: null,
    listPriceDisplay: null,
    discount: null,
    discountDisplay: null,
    offerTypes: [],
    finance: {
      deposit: null,
      depositDisplay: null,
      repayment: null,
      repaymentDisplay: null,
      repaymentPeriod: null,
      comparisonRate: null,
      comparisonRateDisplay: null,
      termMonths: null,
      termDisplay: null,
      balloon: null,
      balloonDisplay: null,
      eligibility: null
    },
    expiry: null,
    ctas: [],
    disclaimers: [],
    ...patch
  }
}

function page(input: {
  id: string
  lane: 'owned' | 'competitor'
  url: string
  facts: AutomotivePageFacts
  observedAt?: string
}) {
  return {
    id: input.id,
    clientId: CLIENT_ID,
    domainId: `${input.id}-domain`,
    lane: input.lane,
    canonicalUrl: input.url,
    sourceUrl: input.url,
    facts: input.facts,
    observedAt: input.observedAt ?? NOW.toISOString()
  }
}

describe('compareAutomotiveOffers', () => {
  it('prefers an exact-model comparison over a category-level comparison', () => {
    const competitor = page({
      id: 'competitor-h6',
      lane: 'competitor',
      url: 'https://competitor.example/h6',
      facts: facts({ offerTypes: ['price'], driveAwayPrice: 41990, expiry: '2026-09-01' })
    })
    const result = compareAutomotiveOffers([
      page({
        id: 'owned-category',
        lane: 'owned',
        url: 'https://owned.example/cannon',
        facts: facts({ model: 'Cannon', bodyType: 'SUV' })
      }),
      page({
        id: 'owned-h6',
        lane: 'owned',
        url: 'https://owned.example/h6',
        facts: facts({ model: 'Haval H6' })
      })
    ], [competitor], NOW)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      status: 'gap',
      comparisonLevel: 'exact_model',
      ownedPageId: 'owned-h6',
      competitorPageIds: ['competitor-h6']
    })
  })

  it('does not treat an expired competitor offer as current', () => {
    const result = compareAutomotiveOffers([], [page({
      id: 'expired',
      lane: 'competitor',
      url: 'https://competitor.example/expired',
      facts: facts({ offerTypes: ['finance'], expiry: '2026-07-31' })
    })], NOW)

    expect(result).toEqual([])
  })

  it('returns insufficient_data instead of inventing a comparison', () => {
    const result = compareAutomotiveOffers([], [page({
      id: 'unknown',
      lane: 'competitor',
      url: 'https://competitor.example/offers',
      facts: facts({ model: null, bodyType: null, offerTypes: ['price'], expiry: '2026-09-01' })
    })], NOW)

    expect(result).toEqual([expect.objectContaining({ status: 'insufficient_data', confidence: 0 })])
  })
})

describe('joinOwnedAudienceContext', () => {
  it('joins only exact canonical owned page URLs and exposes aggregates, not visitor rows', () => {
    const rows = joinOwnedAudienceContext([
      { pageId: 'owned-h6', canonicalUrl: 'https://owned.example/h6?utm_source=test' }
    ], [
      {
        key: 'https://owned.example/h6',
        visitors: 80,
        sessions: 100,
        engagementRate: 60,
        leadActions: 4,
        confirmedLeads: 1,
        confirmedLeadRate: 1
      },
      {
        key: 'https://owned.example/other',
        visitors: 500,
        sessions: 600,
        engagementRate: 70,
        leadActions: 20,
        confirmedLeads: 10,
        confirmedLeadRate: 1.7,
        anonId: 'must-not-leak'
      } as never
    ])

    expect(rows).toEqual([{
      pageId: 'owned-h6',
      canonicalUrl: 'https://owned.example/h6',
      visitors: 80,
      sessions: 100,
      engagementRate: 60,
      leadActions: 4,
      confirmedLeads: 1,
      confirmedLeadRate: 1
    }])
    expect(Object.keys(rows[0]!).join(' ')).not.toMatch(/anonId|sessionId|visitorId/i)
  })
})

describe('deriveSiteIntelligenceInsights', () => {
  it('covers all six deterministic rules with traceable evidence', () => {
    const owned = page({
      id: 'owned-h6',
      lane: 'owned',
      url: 'https://owned.example/h6',
      observedAt: '2026-08-01T03:00:00.000Z',
      facts: facts({
        pageType: 'landing_page',
        expiry: '2026-07-31',
        ctas: ['learn_more']
      })
    })
    const competitor = page({
      id: 'competitor-h6',
      lane: 'competitor',
      url: 'https://competitor.example/h6-offer',
      facts: facts({
        pageType: 'offer',
        offerTypes: ['finance'],
        driveAwayPrice: 41990,
        expiry: '2026-09-01',
        ctas: ['get_quote', 'test_drive']
      })
    })
    const competitorService = page({
      id: 'competitor-service',
      lane: 'competitor',
      url: 'https://competitor.example/service',
      facts: facts({ pageType: 'service', model: null, bodyType: null })
    })

    const insights = deriveSiteIntelligenceInsights({
      clientId: CLIENT_ID,
      pages: [owned, competitor, competitorService],
      changes: [{
        id: 'change-offer',
        pageId: 'competitor-h6',
        lane: 'competitor',
        sourceUrl: competitor.sourceUrl,
        observedAt: competitor.observedAt,
        changedFields: ['driveAwayPrice', 'offerTypes'],
        before: { driveAwayPrice: null, offerTypes: [] },
        after: { driveAwayPrice: 41990, offerTypes: ['price'] }
      }],
      audienceContext: [{
        pageId: 'owned-h6',
        canonicalUrl: owned.canonicalUrl,
        visitors: 80,
        sessions: 100,
        engagementRate: 60,
        leadActions: 4,
        confirmedLeads: 1,
        confirmedLeadRate: 1
      }],
      campaignMessages: [{
        id: 'campaign-1',
        landingPageUrl: owned.canonicalUrl,
        model: 'Haval H6',
        offerTypes: ['price'],
        ctas: ['get_quote']
      }],
      now: NOW
    })

    expect(new Set(insights.map(item => item.type))).toEqual(new Set([
      'offer_change',
      'offer_gap',
      'landing_mismatch',
      'high_traffic_stale_content',
      'content_gap',
      'conversion_context'
    ]))
    expect(insights.find(item => item.type === 'offer_change')?.title).toBe('Competitor offer introduced')
    expect(insights.every(item => (
      item.ruleVersion === 'automotive-intelligence-v1'
      && item.confidence >= 0
      && item.confidence <= 1
      && item.observedAt.length > 0
      && item.evidencePageIds.length + item.evidenceChangeIds.length > 0
      && item.evidenceUrls.length > 0
    ))).toBe(true)
  })

  it('distinguishes an offer removal from a generic material change', () => {
    const owned = page({
      id: 'owned-h6',
      lane: 'owned',
      url: 'https://owned.example/h6',
      facts: facts()
    })
    const insights = deriveSiteIntelligenceInsights({
      clientId: CLIENT_ID,
      pages: [owned],
      changes: [{
        id: 'removed-offer',
        pageId: owned.id,
        lane: 'owned',
        sourceUrl: owned.sourceUrl,
        observedAt: owned.observedAt,
        changedFields: ['driveAwayPrice'],
        before: { driveAwayPrice: 42990 },
        after: { driveAwayPrice: null }
      }],
      now: NOW
    })

    expect(insights[0]?.title).toBe('Owned offer removed')
  })

  it('never adds competitor performance or audience fields', () => {
    const competitor = page({
      id: 'competitor-h6',
      lane: 'competitor',
      url: 'https://competitor.example/h6',
      facts: facts({ offerTypes: ['price'], driveAwayPrice: 41990, expiry: '2026-09-01' })
    })
    const insights = deriveSiteIntelligenceInsights({
      clientId: CLIENT_ID,
      pages: [competitor],
      audienceContext: [],
      now: NOW
    })

    expect(JSON.stringify(insights)).not.toMatch(/competitor(?:Visitor|Audience|Conversion|Reach|Spend)/i)
    for (const insight of insights.filter(item => item.lane === 'competitor')) {
      expect(Object.keys(insight).join(' ')).not.toMatch(/visitor|audience|conversion|reach|spend/i)
    }
  })
})
