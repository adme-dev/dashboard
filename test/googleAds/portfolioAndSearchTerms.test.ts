import { describe, expect, it, vi } from 'vitest'
import { listGoogleAdsSearchTerms, searchTermDateRange } from '~~/server/utils/googleAds/searchTermsLive'
import {
  reviewGoogleAdsPortfolio,
  summariseConversionActions,
  summariseRecommendations,
  summariseWastedSearchTerms,
  type PortfolioAccount
} from '~~/server/utils/googleAds/portfolioReview'

const auth = { accessToken: 't' } as never
const row = (term: string, costMicros: number, conversions: number, customer = '1234567890') => ({
  searchTermView: { searchTerm: term, status: 'NONE', adGroup: `customers/${customer}/adGroups/9` },
  campaign: { resourceName: `customers/${customer}/campaigns/111`, name: 'Search' },
  metrics: { impressions: '100', clicks: '4', costMicros: String(costMicros), conversions }
})

describe('live search terms', () => {
  it('uses a closed date window ending yesterday', () => {
    expect(searchTermDateRange(30, new Date('2026-11-19T03:00:00Z'))).toEqual({ startDate: '2026-10-20', endDate: '2026-11-18' })
    expect(searchTermDateRange(7, new Date('2026-11-19T03:00:00Z'))).toEqual({ startDate: '2026-11-12', endDate: '2026-11-18' })
  })

  it('builds a typed, cost-ordered GAQL query and normalises micros to account currency', async () => {
    const query = vi.fn(async () => ({ rows: [row('free car', 12_340_000, 0)], more: 0, requestId: 'r1' }))
    const result = await listGoogleAdsSearchTerms({
      customerId: '1234567890', auth, windowDays: 30, maxResults: 50, wastedOnly: true,
      campaignResourceName: 'customers/1234567890/campaigns/111'
    }, { query, now: () => new Date('2026-11-19T03:00:00Z') })
    const sent = (query.mock.calls[0]![0] as { query: string, maxRows: number }).query
    expect(sent).toContain('FROM search_term_view')
    expect(sent).toContain('segments.date BETWEEN \'2026-10-20\' AND \'2026-11-18\'')
    expect(sent).toContain('metrics.conversions = 0')
    expect(sent).toContain('campaign.resource_name = \'customers/1234567890/campaigns/111\'')
    expect(sent).toContain('ORDER BY metrics.cost_micros DESC')
    expect(result.items).toEqual([expect.objectContaining({ searchTerm: 'free car', clicks: 4, cost: 12.34, cpc: 3.09, conversions: 0 })])
  })

  it('omits the zero-conversion filter unless wastedOnly, and rejects untyped campaign names', async () => {
    const query = vi.fn(async () => ({ rows: [], more: 0 }))
    await listGoogleAdsSearchTerms({ customerId: '1234567890', auth, windowDays: 7, maxResults: 10, wastedOnly: false }, { query })
    expect((query.mock.calls[0]![0] as { query: string }).query).not.toContain('metrics.conversions = 0')
    await expect(listGoogleAdsSearchTerms({ customerId: '1234567890', auth, windowDays: 7, maxResults: 10, wastedOnly: false, campaignResourceName: 'x\' OR 1=1' }, { query }))
      .rejects.toThrow()
  })

  it('refuses rows that reference another Google customer', async () => {
    const query = vi.fn(async () => ({ rows: [row('leak', 1_000_000, 0, '9999999999')], more: 0 }))
    await expect(listGoogleAdsSearchTerms({ customerId: '1234567890', auth, windowDays: 30, maxResults: 10, wastedOnly: false }, { query }))
      .rejects.toThrow('Cross-customer')
  })
})

describe('portfolio review', () => {
  const accounts: PortfolioAccount[] = [
    { clientId: 'c1', clientName: 'Alpha Kia', connectionId: 'k1', customerId: '1' },
    { clientId: 'c2', clientName: 'Beta Ford', connectionId: 'k2', customerId: '2' },
    { clientId: 'c3', clientName: 'Gamma GWM', connectionId: 'k3', customerId: '3' }
  ]

  it('summarises conversion-action problems', () => {
    expect(summariseConversionActions({ items: [
      { name: 'Lead form', status: 'ENABLED', primaryForGoal: true, recentActivity: { state: 'zero' } },
      { name: 'Old call', status: 'HIDDEN', primaryForGoal: true },
      { name: 'Page view', status: 'ENABLED', primaryForGoal: false }
    ] }).issues.map(issue => issue.issue)).toEqual(['primary_action_zero_conversions', 'primary_action_not_enabled'])
    expect(summariseConversionActions({ items: [{ status: 'ENABLED', primaryForGoal: false }] }).issues)
      .toEqual([{ issue: 'no_enabled_primary_conversion_action' }])
  })

  it('summarises recommendations and wasted terms', () => {
    const recs = summariseRecommendations({ optimizationScore: 0.71, items: [{ type: 'KEYWORD' }, { type: 'KEYWORD' }, { type: 'SITELINK_ASSET' }] }, 2)
    expect(recs).toMatchObject({ optimizationScore: 0.71, count: 3, byType: { KEYWORD: 2, SITELINK_ASSET: 1 } })
    expect(recs.top).toHaveLength(2)
    expect(summariseWastedSearchTerms({ items: [{ searchTerm: 'a', cost: 10.5 }, { searchTerm: 'b', cost: 2.25 }] }, 1))
      .toMatchObject({ wastedCost: 12.75, wastedTerms: 2, top: [{ searchTerm: 'a' }] })
  })

  it('isolates a failing account, ranks by attention and stays within the concurrency limit', async () => {
    let active = 0
    let peak = 0
    const track = async <T>(value: T) => {
      active++
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active--
      return value
    }
    const readers = {
      recommendations: vi.fn(async () => track({ items: [{ type: 'KEYWORD' }] })),
      conversionActions: vi.fn(async (account: PortfolioAccount) => track(account.clientId === 'c2'
        ? { items: [{ name: 'Lead', status: 'ENABLED', primaryForGoal: true, recentActivity: { state: 'zero' } }] }
        : { items: [{ name: 'Lead', status: 'ENABLED', primaryForGoal: true, recentActivity: { state: 'observed' } }] })),
      wastedSearchTerms: vi.fn(async (account: PortfolioAccount) => {
        if (account.clientId === 'c3') throw new Error('Google Ads quota exhausted')
        return track({ items: [{ searchTerm: 'x', cost: account.clientId === 'c1' ? 50 : 5 }] })
      })
    }
    const review = await reviewGoogleAdsPortfolio({ accounts, sections: ['recommendations', 'conversion_actions', 'search_terms'], windowDays: 30, perAccountLimit: 3, concurrency: 2 }, readers)
    expect(review.accountsReviewed).toBe(3)
    expect(review.accountsWithErrors).toBe(1)
    expect(review.accounts.find(a => a.clientId === 'c3')).toMatchObject({ errors: { search_terms: 'Google Ads quota exhausted' } })
    expect(review.attention.map(row => row.clientName)).toEqual(['Beta Ford', 'Alpha Kia', 'Gamma GWM'])
    expect(review.totals).toMatchObject({ wastedCost: 55, conversionIssues: 1, recommendations: 3 })
    expect(readers.conversionActions).toHaveBeenCalledWith(accounts[0], 'LAST_30_DAYS')
    expect(peak).toBeLessThanOrEqual(6)
  })

  it('only runs the requested sections', async () => {
    const readers = { recommendations: vi.fn(async () => ({ items: [] })), conversionActions: vi.fn(), wastedSearchTerms: vi.fn() }
    await reviewGoogleAdsPortfolio({ accounts: accounts.slice(0, 1), sections: ['recommendations'], windowDays: 7, perAccountLimit: 3 }, readers as never)
    expect(readers.conversionActions).not.toHaveBeenCalled()
    expect(readers.wastedSearchTerms).not.toHaveBeenCalled()
  })

  it('names the Google error code and field for a failed section', async () => {
    const err = Object.assign(new Error('Google Ads rejected the requested fields.'), { code: 'PROHIBITED_FIELD_IN_SELECT_CLAUSE', fieldPath: 'recommendation.impact' })
    const readers = { recommendations: vi.fn(async () => { throw err }), conversionActions: vi.fn(), wastedSearchTerms: vi.fn() }
    const review = await reviewGoogleAdsPortfolio({ accounts: accounts.slice(0, 1), sections: ['recommendations'], windowDays: 30, perAccountLimit: 3 }, readers as never)
    expect(review.accounts[0]).toMatchObject({ errors: { recommendations: 'Google Ads rejected the requested fields. (PROHIBITED_FIELD_IN_SELECT_CLAUSE @ recommendation.impact)' } })
  })

  it('stays compact: issue counts by type, capped list, and account names in the attention list', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `Call ${i}`, status: 'ENABLED', primaryForGoal: true, recentActivity: { state: 'zero' } }))
    const summary = summariseConversionActions({ items: many }, 3)
    expect(summary).toMatchObject({ issuesTotal: 12, issueCounts: { primary_action_zero_conversions: 12 }, moreIssues: 9 })
    expect(summary.issues).toHaveLength(3)
    const readers = { recommendations: vi.fn(), conversionActions: vi.fn(async () => ({ items: many })), wastedSearchTerms: vi.fn() }
    const review = await reviewGoogleAdsPortfolio({ accounts: [{ ...accounts[0]!, accountName: 'Northern MG' }], sections: ['conversion_actions'], windowDays: 30, perAccountLimit: 3 }, readers as never)
    expect(review.attention[0]).toMatchObject({ accountName: 'Northern MG', customerId: '1', conversionIssues: 12 })
  })

  it('counts recommendations from the producer shape (recommendations, not items)', () => {
    expect(summariseRecommendations({ optimizationScore: 0.6, recommendations: [{ type: 'KEYWORD' }, { type: 'SITELINK_ASSET' }] }, 5))
      .toMatchObject({ optimizationScore: 0.6, count: 2, byType: { KEYWORD: 1, SITELINK_ASSET: 1 } })
  })
})
