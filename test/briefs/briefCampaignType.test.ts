import { describe, it, expect } from 'vitest'
import {
  briefToMondayCampaignType,
  isMondayMappableTemplate,
  MONDAY_CAMPAIGN_TYPES,
} from '~~/server/utils/briefCampaignType'

describe('briefToMondayCampaignType', () => {
  it('maps the four job types live on the "Items to Action" board', () => {
    // Meta AIA Traffic (24 board items)
    expect(briefToMondayCampaignType({ templateSlug: 'meta-aia', objective: 'traffic' }))
      .toBe('M_AIA_Traffic')
    // Meta AIA Lead Gen (8 board items)
    expect(briefToMondayCampaignType({ templateSlug: 'meta-aia', objective: 'leads' }))
      .toBe('M_AIA_Leads')
    // Google Performance Max Inventory (5 board items)
    expect(briefToMondayCampaignType({ templateSlug: 'google-pmax', objective: 'inventory' }))
      .toBe('G_PMaxInventory')
    // Meta Lead Gen, standard non-AIA (1 board item)
    expect(briefToMondayCampaignType({ templateSlug: 'facebook-ads', objective: 'leads' }))
      .toBe('M_Leads')
  })

  it('reads the objective from the template-specific field key when no override given', () => {
    expect(briefToMondayCampaignType({
      templateSlug: 'meta-aia',
      fields: { objective: 'traffic', campaign_name: 'x' },
    })).toBe('M_AIA_Traffic')

    expect(briefToMondayCampaignType({
      templateSlug: 'facebook-ads',
      fields: { campaign_objective: 'awareness' },
    })).toBe('M_Awareness')

    expect(briefToMondayCampaignType({
      templateSlug: 'google-pmax',
      fields: { pmax_type: 'standard' },
    })).toBe('G_PMaxStandard')

    expect(briefToMondayCampaignType({
      templateSlug: 'google-ads',
      fields: { campaign_type: 'search' },
    })).toBe('G_Search')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(briefToMondayCampaignType({ templateSlug: 'meta-aia', objective: '  Leads ' }))
      .toBe('M_AIA_Leads')
  })

  it('folds Google Search subtypes onto G_Search', () => {
    expect(briefToMondayCampaignType({ templateSlug: 'google-ads', objective: 'dsa' })).toBe('G_Search')
    expect(briefToMondayCampaignType({ templateSlug: 'google-ads', objective: 'call_only' })).toBe('G_Search')
  })

  it('maps the TikTok objectives the board has codes for', () => {
    expect(briefToMondayCampaignType({ templateSlug: 'tiktok-ads', objective: 'reach' })).toBe('T_Awareness')
    expect(briefToMondayCampaignType({ templateSlug: 'tiktok-ads', objective: 'community_interaction' })).toBe('T_Boosted')
  })

  it('returns null when no exact board code exists (never guesses)', () => {
    // Meta has no M_AIA_Sales / M_Sales / M_Conversions on the board
    expect(briefToMondayCampaignType({ templateSlug: 'meta-aia', objective: 'sales' })).toBeNull()
    expect(briefToMondayCampaignType({ templateSlug: 'facebook-ads', objective: 'sales' })).toBeNull()
    expect(briefToMondayCampaignType({ templateSlug: 'facebook-ads', objective: 'app_promo' })).toBeNull()
    expect(briefToMondayCampaignType({ templateSlug: 'tiktok-ads', objective: 'product_sales' })).toBeNull()
  })

  it('returns null for non-ad templates and unknown objectives', () => {
    expect(briefToMondayCampaignType({ templateSlug: 'newspaper-ad', objective: 'whatever' })).toBeNull()
    expect(briefToMondayCampaignType({ templateSlug: 'support-ticket' })).toBeNull()
    expect(briefToMondayCampaignType({ templateSlug: 'meta-aia', objective: 'nonsense' })).toBeNull()
    expect(briefToMondayCampaignType({ templateSlug: 'meta-aia' })).toBeNull() // no objective at all
  })

  it('every produced code is a real board Campaign Type label', () => {
    const codes: string[] = [
      briefToMondayCampaignType({ templateSlug: 'meta-aia', objective: 'traffic' }),
      briefToMondayCampaignType({ templateSlug: 'meta-aia', objective: 'leads' }),
      briefToMondayCampaignType({ templateSlug: 'google-pmax', objective: 'inventory' }),
      briefToMondayCampaignType({ templateSlug: 'facebook-ads', objective: 'leads' }),
    ].filter((c): c is string => c !== null)
    expect(codes).toHaveLength(4)
    for (const c of codes) {
      expect(MONDAY_CAMPAIGN_TYPES).toContain(c)
    }
  })
})

describe('isMondayMappableTemplate', () => {
  it('recognises the ad templates', () => {
    for (const slug of ['meta-aia', 'facebook-ads', 'google-ads', 'google-pmax', 'tiktok-ads']) {
      expect(isMondayMappableTemplate(slug)).toBe(true)
    }
  })
  it('rejects non-ad templates', () => {
    for (const slug of ['newspaper-ad', 'support-ticket', 'landing-page', 'email-campaign']) {
      expect(isMondayMappableTemplate(slug)).toBe(false)
    }
  })
})
