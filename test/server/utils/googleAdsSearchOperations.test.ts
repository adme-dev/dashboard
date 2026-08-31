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
