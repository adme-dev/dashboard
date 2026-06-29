import { describe, expect, it } from 'vitest'

import {
  buildCampaignBudgetIdentity,
  normalizeBudgetPlatform
} from '~~/server/utils/campaignBudgetIdentity'

describe('campaign budget identity', () => {
  it('normalizes platform aliases used by analytics and platform routes', () => {
    expect(normalizeBudgetPlatform('google')).toBe('google_ads')
    expect(normalizeBudgetPlatform('google_ads')).toBe('google_ads')
    expect(normalizeBudgetPlatform('meta_ads')).toBe('meta')
    expect(normalizeBudgetPlatform('facebook')).toBe('meta')
    expect(normalizeBudgetPlatform('microsoft')).toBe('microsoft_ads')
  })

  it('builds the same canonical key for a campaign budget across routes', () => {
    const identity = buildCampaignBudgetIdentity({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      platform: 'google',
      accountId: '1234567890',
      campaignExternalId: 'campaign-99',
      period: '2026-06',
      mediaSpendId: 'spend-1',
      campaignName: 'EOFY Leads'
    })

    expect(identity).toMatchObject({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      platform: 'google_ads',
      accountId: '1234567890',
      campaignExternalId: 'campaign-99',
      period: '2026-06',
      actionable: true,
      issues: []
    })
    expect(identity.key).toBe('tenant:tenant-1|client:client-1|platform:google_ads|account:1234567890|campaign:campaign-99|period:2026-06')
    expect(identity.fallbackKey).toBe(identity.key)
  })

  it('handles missing external campaign ids explicitly and keeps a stable fallback row key', () => {
    const identity = buildCampaignBudgetIdentity({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      platform: 'meta',
      accountId: 'act-1',
      campaignExternalId: null,
      period: '2026-06',
      mediaSpendId: 'spend-1',
      campaignName: 'Manual Campaign'
    })

    expect(identity.key).toBeNull()
    expect(identity.actionable).toBe(false)
    expect(identity.issues).toContain('missing_campaign_external_id')
    expect(identity.fallbackKey).toBe('tenant:tenant-1|client:client-1|platform:meta|account:act-1|campaign-fallback:media-spend:spend-1|period:2026-06')
  })

  it('marks campaigns without account or period as not actionable', () => {
    const identity = buildCampaignBudgetIdentity({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      platform: 'meta',
      campaignExternalId: 'campaign-1'
    })

    expect(identity.key).toBeNull()
    expect(identity.actionable).toBe(false)
    expect(identity.issues).toEqual(expect.arrayContaining([
      'missing_account_id',
      'missing_period'
    ]))
  })
})
