import { describe, expect, it } from 'vitest'
import type { BuildGoogleAdsActionContext } from '~~/server/utils/googleAds/actionPlanner'
import {
  buildSearchGoogleAdsAction,
  parseSearchGoogleAdsArguments
} from '~~/server/utils/googleAds/searchOperations'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const CUSTOMER_ID = '1234567890'

function context(
  operation: BuildGoogleAdsActionContext['input']['operation'],
  resourceType: BuildGoogleAdsActionContext['input']['resourceType'],
  args: unknown,
  currentState: unknown
): BuildGoogleAdsActionContext {
  return {
    input: {
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      actorId: ACTOR_ID,
      source: 'mcp',
      operation,
      resourceType,
      requestedMode: 'proposal',
      arguments: args,
      idempotencyKey: `search:${operation}:1`
    },
    connection: {
      clientId: CLIENT_ID,
      connectionId: CONNECTION_ID,
      customerId: CUSTOMER_ID,
      platform: 'google',
      status: 'active'
    },
    customerId: CUSTOMER_ID,
    currentState
  }
}

describe('Search Google Ads status operations', () => {
  it.each([
    ['pause_campaign', 'campaign', 'campaigns', 'customers/1234567890/campaigns/10', 'PAUSED'],
    ['archive_campaign', 'campaign', 'campaigns', 'customers/1234567890/campaigns/10', 'PAUSED'],
    ['enable_campaign', 'campaign', 'campaigns', 'customers/1234567890/campaigns/10', 'ENABLED'],
    ['pause_ad_group', 'ad_group', 'adGroups', 'customers/1234567890/adGroups/20', 'PAUSED'],
    ['archive_ad', 'ad', 'adGroupAds', 'customers/1234567890/adGroupAds/20~30', 'PAUSED'],
    ['pause_keyword', 'keyword', 'adGroupCriteria', 'customers/1234567890/adGroupCriteria/20~40', 'PAUSED']
  ] as const)('builds %s as a typed %s status update', (operation, resourceType, service, resourceName, status) => {
    const built = buildSearchGoogleAdsAction(context(
      operation,
      resourceType,
      { resourceName },
      { resourceName, status: 'ENABLED' }
    ))

    expect(built).toEqual({
      resourceName,
      desiredState: { resourceName, status },
      providerOperations: [{
        service,
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{
          update: { resourceName, status },
          updateMask: 'status'
        }]
      }]
    })
  })

  it('rejects a cross-customer resource name', () => {
    expect(() => buildSearchGoogleAdsAction(context(
      'pause_campaign',
      'campaign',
      { resourceName: 'customers/9999999999/campaigns/10' },
      { resourceName: 'customers/9999999999/campaigns/10', status: 'ENABLED' }
    ))).toThrow('selected Google Ads customer')
  })

  it('does not treat archive as irreversible provider removal', () => {
    const built = buildSearchGoogleAdsAction(context(
      'archive_ad_group',
      'ad_group',
      { resourceName: 'customers/1234567890/adGroups/20' },
      { resourceName: 'customers/1234567890/adGroups/20', status: 'ENABLED' }
    ))
    expect(built.providerOperations[0]?.operations[0]).not.toHaveProperty('remove')
  })
})

describe('Search Google Ads negative keyword operations', () => {
  it('normalizes and deduplicates typed ad-group negative keywords', () => {
    const parentResourceName = 'customers/1234567890/adGroups/20'
    const built = buildSearchGoogleAdsAction(context(
      'add_negative_keywords',
      'negative_keyword',
      {
        scope: 'ad_group',
        parentResourceName,
        keywords: [
          { text: ' Free ', matchType: 'EXACT' },
          { text: 'free', matchType: 'EXACT' },
          { text: 'jobs', matchType: 'PHRASE' }
        ]
      },
      { criteria: [] }
    ))

    expect(built.resourceName).toBe(parentResourceName)
    expect(built.desiredState).toEqual({
      criteria: [
        { text: 'Free', matchType: 'EXACT', negative: true },
        { text: 'jobs', matchType: 'PHRASE', negative: true }
      ]
    })
    expect(built.providerOperations).toEqual([{
      service: 'adGroupCriteria',
      atomicity: 'independent',
      partialFailure: true,
      operations: [
        { create: { adGroup: parentResourceName, negative: true, keyword: { text: 'Free', matchType: 'EXACT' } } },
        { create: { adGroup: parentResourceName, negative: true, keyword: { text: 'jobs', matchType: 'PHRASE' } } }
      ]
    }])
  })

  it('builds campaign negatives through campaignCriteria', () => {
    const parentResourceName = 'customers/1234567890/campaigns/10'
    const built = buildSearchGoogleAdsAction(context(
      'add_negative_keywords',
      'negative_keyword',
      {
        scope: 'campaign',
        parentResourceName,
        keywords: [{ text: 'cheap', matchType: 'BROAD' }]
      },
      { criteria: [] }
    ))

    expect(built.providerOperations[0]).toMatchObject({
      service: 'campaignCriteria',
      operations: [{
        create: {
          campaign: parentResourceName,
          negative: true,
          keyword: { text: 'cheap', matchType: 'BROAD' }
        }
      }]
    })
  })

  it('rejects raw provider-shaped fields and empty terms', () => {
    expect(() => parseSearchGoogleAdsArguments('add_negative_keywords', {
      scope: 'campaign',
      parentResourceName: 'customers/1234567890/campaigns/10',
      keywords: [],
      operations: [{ remove: 'customers/1234567890/campaignCriteria/1' }]
    })).toThrow()
  })
})

describe('Search Google Ads construction operations', () => {
  it('creates a standard campaign budget from a human daily amount', () => {
    const built = buildSearchGoogleAdsAction(context(
      'create_budget',
      'budget',
      { name: 'Northern Search Budget', dailyAmount: 40 },
      { exists: false }
    ))
    expect(built).toEqual({
      resourceName: null,
      desiredState: {
        name: 'Northern Search Budget',
        amountMicros: '40000000',
        deliveryMethod: 'STANDARD',
        explicitlyShared: false
      },
      providerOperations: [{
        service: 'campaignBudgets',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ create: {
          name: 'Northern Search Budget',
          amountMicros: '40000000',
          deliveryMethod: 'STANDARD',
          explicitlyShared: false
        } }]
      }]
    })
  })

  it('updates only the daily budget amount while preserving read-back state', () => {
    const resourceName = 'customers/1234567890/campaignBudgets/50'
    const built = buildSearchGoogleAdsAction(context(
      'update_budget',
      'budget',
      { resourceName, dailyAmount: 55 },
      {
        resourceName,
        name: 'Northern Search Budget',
        amountMicros: '40000000',
        deliveryMethod: 'STANDARD',
        explicitlyShared: false
      }
    ))

    expect(built.desiredState).toEqual({
      resourceName,
      name: 'Northern Search Budget',
      amountMicros: '55000000',
      deliveryMethod: 'STANDARD',
      explicitlyShared: false
    })
    expect(built.providerOperations[0]?.operations).toEqual([{
      update: { resourceName, amountMicros: '55000000' },
      updateMask: 'amount_micros'
    }])
  })

  it('creates Search campaigns paused with no Display expansion', () => {
    const built = buildSearchGoogleAdsAction(context(
      'create_campaign',
      'campaign',
      {
        name: 'Northern GAC Search',
        budgetResourceName: 'customers/1234567890/campaignBudgets/50',
        includeSearchPartners: false
      },
      { exists: false }
    ))
    expect(built.providerOperations[0]).toMatchObject({
      service: 'campaigns',
      operations: [{ create: {
        name: 'Northern GAC Search',
        status: 'PAUSED',
        advertisingChannelType: 'SEARCH',
        campaignBudget: 'customers/1234567890/campaignBudgets/50',
        manualCpc: {},
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: true,
          targetPartnerSearchNetwork: false,
          targetContentNetwork: false
        },
        containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING'
      } }]
    })
    expect((built.desiredState as { status: string }).status).toBe('PAUSED')
  })

  it('creates ad groups and positive keywords paused', () => {
    const campaign = 'customers/1234567890/campaigns/10'
    const adGroup = 'customers/1234567890/adGroups/20'
    const builtAdGroup = buildSearchGoogleAdsAction(context(
      'create_ad_group',
      'ad_group',
      { name: 'SUV Models', campaignResourceName: campaign, cpcBid: 3.5 },
      { exists: false }
    ))
    expect(builtAdGroup.providerOperations[0]?.operations[0]).toEqual({ create: {
      name: 'SUV Models',
      campaign,
      type: 'SEARCH_STANDARD',
      status: 'PAUSED',
      cpcBidMicros: '3500000'
    } })

    const builtKeywords = buildSearchGoogleAdsAction(context(
      'add_keywords',
      'keyword',
      {
        adGroupResourceName: adGroup,
        keywords: [{ text: 'new suv', matchType: 'PHRASE' }]
      },
      { criteria: [] }
    ))
    expect(builtKeywords.providerOperations[0]?.operations[0]).toEqual({ create: {
      adGroup,
      status: 'PAUSED',
      negative: false,
      keyword: { text: 'new suv', matchType: 'PHRASE' }
    } })
  })

  it('deduplicates positive keywords against the current provider state', () => {
    const adGroup = 'customers/1234567890/adGroups/20'
    const built = buildSearchGoogleAdsAction(context(
      'add_keywords',
      'keyword',
      {
        adGroupResourceName: adGroup,
        keywords: [
          { text: ' northern   gac ', matchType: 'EXACT' },
          { text: 'new vehicles', matchType: 'PHRASE' }
        ]
      },
      {
        adGroupResourceName: adGroup,
        criteria: [
          { text: 'Northern GAC', matchType: 'EXACT', negative: false, status: 'ENABLED' }
        ]
      }
    ))

    expect(built.providerOperations[0]?.operations).toEqual([{ create: {
      adGroup,
      status: 'PAUSED',
      negative: false,
      keyword: { text: 'new vehicles', matchType: 'PHRASE' }
    } }])
    expect(built.desiredState).toEqual({
      adGroupResourceName: adGroup,
      criteria: [
        { text: 'Northern GAC', matchType: 'EXACT', negative: false, status: 'ENABLED' },
        { text: 'new vehicles', matchType: 'PHRASE', negative: false, status: 'PAUSED' }
      ]
    })
  })

  it('creates responsive search ads paused with typed text assets', () => {
    const adGroup = 'customers/1234567890/adGroups/20'
    const built = buildSearchGoogleAdsAction(context(
      'create_ad',
      'ad',
      {
        adGroupResourceName: adGroup,
        finalUrl: 'https://example.com/suv',
        headlines: ['Explore New SUVs', 'Book a Test Drive', 'Northern Motors'],
        descriptions: ['Browse the latest SUV range today.', 'Enquire online with Northern Motors.'],
        path1: 'new',
        path2: 'suv'
      },
      { exists: false }
    ))
    expect(built.providerOperations[0]).toMatchObject({
      service: 'adGroupAds',
      operations: [{ create: {
        adGroup,
        status: 'PAUSED',
        ad: {
          finalUrls: ['https://example.com/suv'],
          responsiveSearchAd: {
            headlines: [
              { text: 'Explore New SUVs' },
              { text: 'Book a Test Drive' },
              { text: 'Northern Motors' }
            ],
            descriptions: [
              { text: 'Browse the latest SUV range today.' },
              { text: 'Enquire online with Northern Motors.' }
            ],
            path1: 'new',
            path2: 'suv'
          }
        }
      } }]
    })
  })

  it('rejects unsafe URLs and campaigns that attempt to start enabled', () => {
    expect(() => buildSearchGoogleAdsAction(context(
      'create_ad',
      'ad',
      {
        adGroupResourceName: 'customers/1234567890/adGroups/20',
        finalUrl: 'javascript:alert(1)',
        headlines: ['One', 'Two', 'Three'],
        descriptions: ['First', 'Second']
      },
      { exists: false }
    ))).toThrow()
    expect(() => parseSearchGoogleAdsArguments('create_campaign', {
      name: 'Unsafe Campaign',
      budgetResourceName: 'customers/1234567890/campaignBudgets/50',
      status: 'ENABLED'
    })).toThrow()
  })
})
