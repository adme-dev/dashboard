import { describe, expect, it } from 'vitest'

import { buildCampaignBudgetIdentity, type CampaignBudgetIdentityInput } from '~~/server/utils/campaignBudgetIdentity'

describe('campaign budget cross-route consistency', () => {
  it('resolves the same Google campaign budget key from route-shaped inputs', () => {
    const expectedKey = 'tenant:tenant-1|client:client-1|platform:google_ads|account:123|campaign:campaign-1|period:2026-06'
    const routeInputs: Array<{ route: string, input: CampaignBudgetIdentityInput }> = [
      {
        route: 'Analytics campaigns',
        input: {
          tenantId: 'tenant-1',
          clientId: 'client-1',
          platform: 'google_ads',
          accountId: '123',
          connectionId: 'google-connection-1',
          campaignExternalId: 'campaign-1',
          campaignName: 'EOFY Search',
          mediaSpendId: 'spend-google-1',
          period: '2026-06-01',
        },
      },
      {
        route: 'Google Ads campaigns',
        input: {
          tenantId: 'tenant-1',
          clientId: 'client-1',
          platform: 'google',
          accountId: '123',
          connectionId: 'google-connection-1',
          campaignExternalId: 'campaign-1',
          campaignName: 'EOFY Search',
          mediaSpendId: 'spend-google-1',
          period: '2026-06',
        },
      },
      {
        route: 'Budget health',
        input: {
          tenantId: 'tenant-1',
          clientId: 'client-1',
          platform: 'google',
          accountId: '123',
          connectionId: 'google-connection-1',
          campaignExternalId: 'campaign-1',
          campaignName: 'EOFY Search',
          mediaSpendId: 'spend-google-1',
          period: '2026-06',
        },
      },
      {
        route: 'Spend action planner',
        input: {
          tenantId: 'tenant-1',
          clientId: 'client-1',
          platform: 'google_ads',
          accountId: '123',
          connectionId: 'google-connection-1',
          campaignExternalId: 'campaign-1',
          campaignName: 'EOFY Search',
          mediaSpendId: 'spend-google-1',
          period: '2026-06',
        },
      },
    ]

    for (const { route, input } of routeInputs) {
      const identity = buildCampaignBudgetIdentity(input)
      expect(identity.actionable, route).toBe(true)
      expect(identity.issues, route).toEqual([])
      expect(identity.key, route).toBe(expectedKey)
      expect(identity.fallbackKey, route).toBe(expectedKey)
    }
  })

  it('resolves Meta aliases to the same budget key across routes', () => {
    const expectedKey = 'tenant:tenant-1|client:client-1|platform:meta|account:act-1|campaign:campaign-1|period:2026-06'
    const routeInputs: Array<{ route: string, input: CampaignBudgetIdentityInput }> = [
      {
        route: 'Analytics campaigns',
        input: {
          tenantId: 'tenant-1',
          clientId: 'client-1',
          platform: 'meta_ads',
          accountId: 'act-1',
          campaignExternalId: 'campaign-1',
          period: '2026-06-30',
        },
      },
      {
        route: 'Meta campaigns',
        input: {
          tenantId: 'tenant-1',
          clientId: 'client-1',
          platform: 'facebook',
          accountId: 'act-1',
          campaignExternalId: 'campaign-1',
          period: '2026-06',
        },
      },
      {
        route: 'Budget health',
        input: {
          tenantId: 'tenant-1',
          clientId: 'client-1',
          platform: 'meta',
          accountId: 'act-1',
          campaignExternalId: 'campaign-1',
          period: '2026-06',
        },
      },
    ]

    for (const { route, input } of routeInputs) {
      const identity = buildCampaignBudgetIdentity(input)
      expect(identity.actionable, route).toBe(true)
      expect(identity.key, route).toBe(expectedKey)
    }
  })
})
