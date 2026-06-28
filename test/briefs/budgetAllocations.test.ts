import { describe, it, expect } from 'vitest'
import {
  platformForCampaignType,
  deriveBriefAllocations,
} from '~~/server/utils/briefConversion/budgetAllocations'

describe('platformForCampaignType', () => {
  it('derives the platform from the Monday campaign-code prefix', () => {
    expect(platformForCampaignType('G_Search')).toBe('Google')
    expect(platformForCampaignType('G_PMaxInventory')).toBe('Google')
    expect(platformForCampaignType('M_AIA_Leads')).toBe('Meta')
    expect(platformForCampaignType('M_Boosted')).toBe('Meta')
    expect(platformForCampaignType('T_Awareness')).toBe('TikTok')
    expect(platformForCampaignType('S_Awareness')).toBe('Spotify')
  })

  it('returns null for empty/unknown/non-string codes', () => {
    expect(platformForCampaignType(null)).toBeNull()
    expect(platformForCampaignType(undefined)).toBeNull()
    expect(platformForCampaignType('')).toBeNull()
    expect(platformForCampaignType('X_Whatever')).toBeNull()
    // @ts-expect-error guarding non-string input at runtime
    expect(platformForCampaignType(42)).toBeNull()
  })

  it('is case-insensitive on the prefix', () => {
    expect(platformForCampaignType('g_search')).toBe('Google')
  })
})

describe('deriveBriefAllocations', () => {
  it('prefers budget_max, falls back to budget_min', () => {
    const [a] = deriveBriefAllocations({
      budgetMin: 500, budgetMax: 700, currency: 'AUD',
      campaignType: 'G_PMaxInventory', month: '2026-06',
    })
    expect(a.amount).toBe(700)
    expect(a.campaignType).toBe('G_PMaxInventory')
    expect(a.platform).toBe('Google')
    expect(a.period).toBe('monthly')
    expect(a.month).toBe('2026-06')
    expect(a.state).toBe('proposed')
    expect(a.source).toBe('brief')
    expect(a.currency).toBe('AUD')
  })

  it('falls back to budget_min when max is missing', () => {
    const [a] = deriveBriefAllocations({ budgetMin: 600, budgetMax: null, month: '2026-06' })
    expect(a.amount).toBe(600)
  })

  it('returns no allocation when there is no usable budget', () => {
    expect(deriveBriefAllocations({ budgetMin: null, budgetMax: null, month: '2026-06' })).toEqual([])
    expect(deriveBriefAllocations({ budgetMin: 0, budgetMax: 0, month: '2026-06' })).toEqual([])
  })

  it('defaults currency to AUD and tolerates an unmapped campaign type', () => {
    const [a] = deriveBriefAllocations({ budgetMax: 1000, campaignType: null, month: '2026-06' })
    expect(a.currency).toBe('AUD')
    expect(a.campaignType).toBeNull()
    expect(a.platform).toBeNull()
  })

  it('omits the month for a total-period allocation', () => {
    const [a] = deriveBriefAllocations({ budgetMax: 1200, period: 'total', month: '2026-06' })
    expect(a.period).toBe('total')
    expect(a.month).toBeNull()
  })
})
