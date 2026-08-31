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

  it('replaces campaign locations atomically without an empty-first mutation', () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const built = buildSearchGoogleAdsAction(context(
      'set_locations',
      'location',
      {
        campaignResourceName: campaign,
        geoTargetConstantIds: ['200', '300']
      },
      {
        campaignResourceName: campaign,
        locationIds: ['100', '200'],
        criteria: {
          100: 'customers/1234567890/campaignCriteria/60~1',
          200: 'customers/1234567890/campaignCriteria/60~2'
        }
      }
    ))

    expect(built.desiredState).toEqual({
      campaignResourceName: campaign,
      locationIds: ['200', '300'],
      criteria: {
        200: 'customers/1234567890/campaignCriteria/60~2'
      }
    })
    expect(built.providerOperations).toEqual([{
      service: 'campaignCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        { create: {
          campaign,
          negative: false,
          location: { geoTargetConstant: 'geoTargetConstants/300' }
        } },
        { remove: 'customers/1234567890/campaignCriteria/60~1' }
      ]
    }])
  })

  it('sets presence-only campaign targeting without changing the location set', () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const built = buildSearchGoogleAdsAction(context(
      'set_location_match_mode',
      'location',
      {
        campaignResourceName: campaign,
        positiveGeoTargetType: 'PRESENCE'
      },
      {
        campaignResourceName: campaign,
        positiveGeoTargetType: 'PRESENCE_OR_INTEREST'
      }
    ))

    expect(built).toEqual({
      resourceName: campaign,
      desiredState: {
        campaignResourceName: campaign,
        positiveGeoTargetType: 'PRESENCE'
      },
      providerOperations: [{
        service: 'campaigns',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{
          update: {
            resourceName: campaign,
            geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' }
          },
          updateMask: 'geo_target_type_setting.positive_geo_target_type'
        }]
      }]
    })
  })

  it('rejects a no-op location match mode plan', () => {
    const campaign = 'customers/1234567890/campaigns/60'
    expect(() => buildSearchGoogleAdsAction(context(
      'set_location_match_mode',
      'location',
      { campaignResourceName: campaign, positiveGeoTargetType: 'PRESENCE' },
      { campaignResourceName: campaign, positiveGeoTargetType: 'PRESENCE' }
    ))).toThrow('already matches')
  })

  it('replaces campaign languages atomically', () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const built = buildSearchGoogleAdsAction(context(
      'set_languages',
      'language',
      { campaignResourceName: campaign, languageConstantIds: ['1000', '1002'] },
      {
        campaignResourceName: campaign,
        languageIds: ['1000', '1001'],
        criteria: {
          1000: 'customers/1234567890/campaignCriteria/60~10',
          1001: 'customers/1234567890/campaignCriteria/60~11'
        }
      }
    ))

    expect(built.desiredState).toEqual({
      campaignResourceName: campaign,
      languageIds: ['1000', '1002'],
      criteria: { 1000: 'customers/1234567890/campaignCriteria/60~10' }
    })
    expect(built.providerOperations).toEqual([{
      service: 'campaignCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        { create: {
          campaign,
          negative: false,
          language: { languageConstant: 'languageConstants/1002' }
        } },
        { remove: 'customers/1234567890/campaignCriteria/60~11' }
      ]
    }])
  })

  it('replaces campaign ad schedules atomically using quarter-hour boundaries', () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const monday = {
      dayOfWeek: 'MONDAY' as const,
      startHour: 9,
      startMinute: 0 as const,
      endHour: 17,
      endMinute: 0 as const
    }
    const saturday = {
      dayOfWeek: 'SATURDAY' as const,
      startHour: 9,
      startMinute: 30 as const,
      endHour: 13,
      endMinute: 0 as const
    }
    const built = buildSearchGoogleAdsAction(context(
      'set_ad_schedule',
      'ad_schedule',
      { campaignResourceName: campaign, schedules: [monday, saturday] },
      {
        campaignResourceName: campaign,
        schedules: [monday, {
          dayOfWeek: 'FRIDAY', startHour: 9, startMinute: 0, endHour: 17, endMinute: 0
        }],
        criteria: {
          'MONDAY:09:00-17:00': 'customers/1234567890/campaignCriteria/60~20',
          'FRIDAY:09:00-17:00': 'customers/1234567890/campaignCriteria/60~21'
        }
      }
    ))

    expect(built.desiredState).toEqual({
      campaignResourceName: campaign,
      schedules: [monday, saturday],
      criteria: {
        'MONDAY:09:00-17:00': 'customers/1234567890/campaignCriteria/60~20'
      }
    })
    expect(built.providerOperations).toEqual([{
      service: 'campaignCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        { create: {
          campaign,
          negative: false,
          adSchedule: {
            dayOfWeek: 'SATURDAY',
            startHour: 9,
            startMinute: 'THIRTY',
            endHour: 13,
            endMinute: 'ZERO'
          }
        } },
        { remove: 'customers/1234567890/campaignCriteria/60~21' }
      ]
    }])
  })

  it('rejects overlapping campaign ad schedules', () => {
    expect(() => parseSearchGoogleAdsArguments('set_ad_schedule', {
      campaignResourceName: 'customers/1234567890/campaigns/60',
      schedules: [
        { dayOfWeek: 'MONDAY', startHour: 9, startMinute: 0, endHour: 12, endMinute: 0 },
        { dayOfWeek: 'MONDAY', startHour: 11, startMinute: 45, endHour: 13, endMinute: 0 }
      ]
    })).toThrow()
  })

  it('updates existing campaign device bid modifiers without raw criteria mutation', () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const mobile = 'customers/1234567890/campaignCriteria/60~30'
    const desktop = 'customers/1234567890/campaignCriteria/60~31'
    const built = buildSearchGoogleAdsAction(context(
      'set_devices',
      'device',
      {
        campaignResourceName: campaign,
        devices: [
          { type: 'MOBILE', bidModifier: 0 },
          { type: 'DESKTOP', bidModifier: 1.2 }
        ]
      },
      {
        campaignResourceName: campaign,
        devices: [
          { resourceName: mobile, type: 'MOBILE', bidModifier: 1 },
          { resourceName: desktop, type: 'DESKTOP', bidModifier: 1 }
        ]
      }
    ))

    expect(built.desiredState).toEqual({
      campaignResourceName: campaign,
      devices: [
        { resourceName: desktop, type: 'DESKTOP', bidModifier: 1.2 },
        { resourceName: mobile, type: 'MOBILE', bidModifier: 0 }
      ]
    })
    expect(built.providerOperations).toEqual([{
      service: 'campaignCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        { update: { resourceName: mobile, bidModifier: 0 }, updateMask: 'bid_modifier' },
        { update: { resourceName: desktop, bidModifier: 1.2 }, updateMask: 'bid_modifier' }
      ]
    }])
  })

  it('updates existing typed campaign conversion goals in one governed request', () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const requestQuote = 'customers/1234567890/campaignConversionGoals/60~REQUEST_QUOTE~WEBSITE'
    const submitLeadForm = 'customers/1234567890/campaignConversionGoals/60~SUBMIT_LEAD_FORM~WEBSITE'
    const built = buildSearchGoogleAdsAction(context(
      'set_campaign_conversion_goals',
      'conversion_goal',
      {
        campaignResourceName: campaign,
        goals: [
          { category: 'REQUEST_QUOTE', origin: 'WEBSITE', biddable: true },
          { category: 'SUBMIT_LEAD_FORM', origin: 'WEBSITE', biddable: false }
        ]
      },
      {
        campaignResourceName: campaign,
        goals: [
          { resourceName: requestQuote, category: 'REQUEST_QUOTE', origin: 'WEBSITE', biddable: false },
          { resourceName: submitLeadForm, category: 'SUBMIT_LEAD_FORM', origin: 'WEBSITE', biddable: true }
        ]
      }
    ))

    expect(built.desiredState).toEqual({
      campaignResourceName: campaign,
      goals: [
        { resourceName: requestQuote, category: 'REQUEST_QUOTE', origin: 'WEBSITE', biddable: true },
        { resourceName: submitLeadForm, category: 'SUBMIT_LEAD_FORM', origin: 'WEBSITE', biddable: false }
      ]
    })
    expect(built.providerOperations).toEqual([{
      service: 'campaignConversionGoals',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        { update: { resourceName: requestQuote, biddable: true }, updateMask: 'biddable' },
        { update: { resourceName: submitLeadForm, biddable: false }, updateMask: 'biddable' }
      ]
    }])
  })

  it('rejects campaign-goal combinations Google has not created', () => {
    const campaign = 'customers/1234567890/campaigns/60'
    expect(() => buildSearchGoogleAdsAction(context(
      'set_campaign_conversion_goals',
      'conversion_goal',
      {
        campaignResourceName: campaign,
        goals: [{ category: 'SUBMIT_LEAD_FORM', origin: 'WEBSITE', biddable: false }]
      },
      { campaignResourceName: campaign, goals: [] }
    ))).toThrow('Campaign conversion goal was not found')
  })

  it.each([
    {
      mode: 'CUSTOMER_DEFAULTS',
      args: {},
      current: { goalConfigLevel: 'CAMPAIGN', customConversionGoal: 'customers/1234567890/customConversionGoals/9101' },
      update: { goalConfigLevel: 'CUSTOMER' },
      desired: { goalConfigLevel: 'CUSTOMER', customConversionGoal: '' },
      updateMask: 'goal_config_level'
    },
    {
      mode: 'CAMPAIGN_GOALS',
      args: {},
      current: { goalConfigLevel: 'CAMPAIGN', customConversionGoal: 'customers/1234567890/customConversionGoals/9101' },
      update: { customConversionGoal: '' },
      desired: { goalConfigLevel: 'CAMPAIGN', customConversionGoal: '' },
      updateMask: 'custom_conversion_goal'
    },
    {
      mode: 'CUSTOM_GOAL',
      args: { customConversionGoalResourceName: 'customers/1234567890/customConversionGoals/9102' },
      current: { goalConfigLevel: 'CUSTOMER' },
      update: {
        goalConfigLevel: 'CAMPAIGN',
        customConversionGoal: 'customers/1234567890/customConversionGoals/9102'
      },
      desired: {
        goalConfigLevel: 'CAMPAIGN',
        customConversionGoal: 'customers/1234567890/customConversionGoals/9102'
      },
      updateMask: 'goal_config_level,custom_conversion_goal'
    }
  ] as const)('sets campaign goal configuration mode $mode', ({ mode, args, current, update, desired, updateMask }) => {
    const campaign = 'customers/1234567890/campaigns/60'
    const resourceName = 'customers/1234567890/conversionGoalCampaignConfigs/60'
    const built = buildSearchGoogleAdsAction(context(
      'set_conversion_goal', 'conversion_goal', { campaignResourceName: campaign, mode, ...args }, {
        resourceName, campaignResourceName: campaign, ...current
      }
    ))
    expect(built).toEqual({
      resourceName,
      desiredState: { resourceName, campaignResourceName: campaign, ...desired },
      providerOperations: [{
        service: 'conversionGoalCampaignConfigs',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ update: { resourceName, ...update }, updateMask }]
      }]
    })
  })

  it('enforces custom-goal mode arguments, tenant binding, and no-op rejection', () => {
    const campaignResourceName = 'customers/1234567890/campaigns/60'
    const resourceName = 'customers/1234567890/conversionGoalCampaignConfigs/60'
    expect(() => parseSearchGoogleAdsArguments('set_conversion_goal', {
      campaignResourceName, mode: 'CUSTOM_GOAL'
    })).toThrow('requires a custom conversion goal')
    expect(() => parseSearchGoogleAdsArguments('set_conversion_goal', {
      campaignResourceName,
      mode: 'CUSTOMER_DEFAULTS',
      customConversionGoalResourceName: 'customers/1234567890/customConversionGoals/9101'
    })).toThrow('only valid in CUSTOM_GOAL mode')
    expect(() => buildSearchGoogleAdsAction(context(
      'set_conversion_goal', 'conversion_goal', {
        campaignResourceName,
        mode: 'CUSTOM_GOAL',
        customConversionGoalResourceName: 'customers/9999999999/customConversionGoals/9101'
      }, { resourceName, campaignResourceName, goalConfigLevel: 'CUSTOMER' }
    ))).toThrow('selected Google Ads customer')
    expect(() => buildSearchGoogleAdsAction(context(
      'set_conversion_goal', 'conversion_goal', { campaignResourceName, mode: 'CUSTOMER_DEFAULTS' },
      { resourceName, campaignResourceName, goalConfigLevel: 'CUSTOMER' }
    ))).toThrow('already matches')
  })

  it('sets customer conversion-goal biddability with an exact update mask', () => {
    const resourceName = 'customers/1234567890/customerConversionGoals/REQUEST_QUOTE~WEBSITE'
    const built = buildSearchGoogleAdsAction(context(
      'set_customer_goal_biddability',
      'conversion_goal',
      { category: 'REQUEST_QUOTE', origin: 'WEBSITE', biddable: false },
      { resourceName, category: 'REQUEST_QUOTE', origin: 'WEBSITE', biddable: true }
    ))

    expect(built).toEqual({
      resourceName,
      desiredState: { resourceName, category: 'REQUEST_QUOTE', origin: 'WEBSITE', biddable: false },
      providerOperations: [{
        service: 'customerConversionGoals',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ update: { resourceName, biddable: false }, updateMask: 'biddable' }]
      }]
    })

    expect(() => buildSearchGoogleAdsAction(context(
      'set_customer_goal_biddability',
      'conversion_goal',
      { category: 'REQUEST_QUOTE', origin: 'WEBSITE', biddable: true },
      { resourceName, category: 'REQUEST_QUOTE', origin: 'WEBSITE', biddable: true }
    ))).toThrow('Customer conversion goal already matches the requested biddability')
  })

  it('atomically replaces explicit ad-group demographic criteria', () => {
    const adGroup = 'customers/1234567890/adGroups/20'
    const male = 'customers/1234567890/adGroupCriteria/20~300'
    const age = 'customers/1234567890/adGroupCriteria/20~301'
    const built = buildSearchGoogleAdsAction(context(
      'set_demographics',
      'demographic',
      {
        adGroupResourceName: adGroup,
        criteria: [
          { dimension: 'GENDER', type: 'MALE', excluded: false },
          { dimension: 'AGE_RANGE', type: 'AGE_RANGE_18_24', excluded: true }
        ]
      },
      {
        adGroupResourceName: adGroup,
        criteria: [
          { resourceName: male, dimension: 'GENDER', type: 'MALE', excluded: false },
          { resourceName: age, dimension: 'AGE_RANGE', type: 'AGE_RANGE_18_24', excluded: false }
        ]
      }
    ))
    expect(built.providerOperations).toEqual([{
      service: 'adGroupCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        { remove: age },
        { create: { adGroup, negative: true, status: 'ENABLED', ageRange: { type: 'AGE_RANGE_18_24' } } }
      ]
    }])
  })

  it('atomically replaces campaign placement exclusions', () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const oldCriterion = 'customers/1234567890/campaignCriteria/60~450'
    const built = buildSearchGoogleAdsAction(context(
      'set_placements',
      'placement',
      { scope: 'campaign', parentResourceName: campaign, urls: ['https://example.com/new'] },
      { scope: 'campaign', parentResourceName: campaign, placements: [{ resourceName: oldCriterion, url: 'https://example.com/old' }] }
    ))
    expect(built.providerOperations).toEqual([{
      service: 'campaignCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [
        { create: { campaign, negative: true, placement: { url: 'https://example.com/new' } } },
        { remove: oldCriterion }
      ]
    }])
  })

  it('atomically replaces campaign content-label exclusions', () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const oldCriterion = 'customers/1234567890/campaignCriteria/60~500'
    const built = buildSearchGoogleAdsAction(context(
      'set_content_exclusions',
      'content_exclusion',
      { campaignResourceName: campaign, labels: ['PROFANITY', 'TRAGEDY'] },
      { campaignResourceName: campaign, labels: [{ resourceName: oldCriterion, type: 'PROFANITY' }] }
    ))
    expect(built.providerOperations).toEqual([{
      service: 'campaignCriteria',
      atomicity: 'interdependent',
      partialFailure: false,
      operations: [{ create: { campaign, negative: true, contentLabel: { type: 'TRAGEDY' } } }]
    }])
  })

  it('sets grouped audience associations and observation mode', () => {
    const adGroup = 'customers/1234567890/adGroups/20'
    const oldAudience = 'customers/1234567890/audiences/700'
    const newAudience = 'customers/1234567890/audiences/701'
    const oldCriterion = 'customers/1234567890/adGroupCriteria/20~600'
    const built = buildSearchGoogleAdsAction(context(
      'set_audience_associations', 'audience',
      { adGroupResourceName: adGroup, audienceResourceNames: [newAudience], mode: 'OBSERVATION' },
      {
        adGroupResourceName: adGroup,
        audienceGrouped: true,
        targetRestrictions: [
          { targetingDimension: 'AGE_RANGE', bidOnly: false },
          { targetingDimension: 'AUDIENCE', bidOnly: false }
        ],
        associations: [{ resourceName: oldCriterion, audienceResourceName: oldAudience }]
      }
    ))
    expect(built.providerOperations).toEqual([
      {
        service: 'adGroups', atomicity: 'interdependent', partialFailure: false,
        operations: [{
          update: { resourceName: adGroup, targetingSetting: { targetRestrictions: [
            { targetingDimension: 'AGE_RANGE', bidOnly: false },
            { targetingDimension: 'AUDIENCE', bidOnly: true }
          ] } },
          updateMask: 'targeting_setting.target_restrictions'
        }]
      },
      {
        service: 'adGroupCriteria', atomicity: 'interdependent', partialFailure: false,
        operations: [
          { create: { adGroup, negative: false, status: 'ENABLED', audience: { audience: newAudience } } },
          { remove: oldCriterion }
        ]
      }
    ])
  })

  it('sets a conversion action to secondary with an exact update mask', () => {
    const resourceName = 'customers/1234567890/conversionActions/9001'
    const current = {
      resourceName,
      name: 'Stock enquiry',
      status: 'ENABLED',
      type: 'WEBPAGE',
      category: 'SUBMIT_LEAD_FORM',
      origin: 'WEBSITE',
      primaryForGoal: true,
      includeInConversionsMetric: true
    }
    const built = buildSearchGoogleAdsAction(context(
      'set_conversion_primary_state',
      'conversion_action',
      { resourceName, primaryForGoal: false },
      current
    ))

    expect(built).toEqual({
      resourceName,
      desiredState: {
        resourceName,
        primaryForGoal: false
      },
      providerOperations: [{
        service: 'conversionActions',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{
          update: { resourceName, primaryForGoal: false },
          updateMask: 'primary_for_goal'
        }]
      }]
    })
  })

  it('creates a typed conversion action with an explicit attribution window', () => {
    const built = buildSearchGoogleAdsAction(context(
      'create_conversion_action',
      'conversion_action',
      {
        name: 'Finance enquiry',
        type: 'WEBPAGE',
        category: 'SUBMIT_LEAD_FORM',
        countingType: 'ONE_PER_CLICK',
        clickThroughLookbackWindowDays: 30,
        viewThroughLookbackWindowDays: 1
      },
      { exists: false }
    ))

    expect(built).toEqual({
      resourceName: null,
      desiredState: {
        name: 'Finance enquiry',
        type: 'WEBPAGE',
        category: 'SUBMIT_LEAD_FORM',
        status: 'ENABLED',
        countingType: 'ONE_PER_CLICK',
        clickThroughLookbackWindowDays: '30',
        viewThroughLookbackWindowDays: '1'
      },
      providerOperations: [{
        service: 'conversionActions',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ create: {
          name: 'Finance enquiry',
          type: 'WEBPAGE',
          category: 'SUBMIT_LEAD_FORM',
          status: 'ENABLED',
          countingType: 'ONE_PER_CLICK',
          clickThroughLookbackWindowDays: '30',
          viewThroughLookbackWindowDays: '1'
        } }]
      }]
    })
  })

  it('updates only explicitly requested mutable conversion-action fields', () => {
    const resourceName = 'customers/1234567890/conversionActions/9001'
    const built = buildSearchGoogleAdsAction(context(
      'update_conversion_action',
      'conversion_action',
      {
        resourceName,
        name: 'Finance lead',
        category: 'QUALIFIED_LEAD',
        status: 'HIDDEN',
        countingType: 'ONE_PER_CLICK',
        clickThroughLookbackWindowDays: 60
      },
      {
        resourceName,
        name: 'Finance enquiry',
        status: 'ENABLED',
        type: 'WEBPAGE',
        category: 'SUBMIT_LEAD_FORM',
        origin: 'WEBSITE',
        primaryForGoal: false,
        includeInConversionsMetric: false,
        countingType: 'MANY_PER_CLICK',
        clickThroughLookbackWindowDays: '30',
        viewThroughLookbackWindowDays: '1'
      }
    ))

    expect(built).toEqual({
      resourceName,
      desiredState: {
        resourceName,
        name: 'Finance lead',
        category: 'QUALIFIED_LEAD',
        status: 'HIDDEN',
        countingType: 'ONE_PER_CLICK',
        clickThroughLookbackWindowDays: '60'
      },
      providerOperations: [{
        service: 'conversionActions',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{
          update: {
            resourceName,
            name: 'Finance lead',
            category: 'QUALIFIED_LEAD',
            status: 'HIDDEN',
            countingType: 'ONE_PER_CLICK',
            clickThroughLookbackWindowDays: '60'
          },
          updateMask: 'name,category,status,counting_type,click_through_lookback_window_days'
        }]
      }]
    })
  })

  it('rejects empty, unchanged, and type-incompatible conversion-action updates', () => {
    const resourceName = 'customers/1234567890/conversionActions/9001'
    const current = {
      resourceName,
      name: 'Offline sale',
      status: 'ENABLED',
      type: 'UPLOAD_CLICKS',
      category: 'PURCHASE',
      origin: 'WEBSITE',
      primaryForGoal: false,
      includeInConversionsMetric: false,
      countingType: 'ONE_PER_CLICK',
      clickThroughLookbackWindowDays: '30'
    }

    expect(() => parseSearchGoogleAdsArguments('update_conversion_action', { resourceName })).toThrow(
      'At least one mutable conversion-action field is required'
    )
    expect(() => buildSearchGoogleAdsAction(context(
      'update_conversion_action',
      'conversion_action',
      { resourceName, name: current.name },
      current
    ))).toThrow('Conversion action already matches the requested values')
    expect(() => buildSearchGoogleAdsAction(context(
      'update_conversion_action',
      'conversion_action',
      { resourceName, viewThroughLookbackWindowDays: 7 },
      current
    ))).toThrow('View-through windows are supported only for WEBPAGE conversion actions')
  })

  it('archives a conversion action as HIDDEN by default and reserves removal for an explicit operation', () => {
    const resourceName = 'customers/1234567890/conversionActions/9001'
    const current = {
      resourceName,
      name: 'Finance enquiry',
      status: 'ENABLED',
      type: 'WEBPAGE',
      category: 'SUBMIT_LEAD_FORM',
      origin: 'WEBSITE',
      primaryForGoal: false,
      includeInConversionsMetric: false
    }

    expect(buildSearchGoogleAdsAction(context(
      'archive_conversion_action', 'conversion_action', { resourceName }, current
    ))).toMatchObject({
      resourceName,
      desiredState: { resourceName, status: 'HIDDEN' },
      providerOperations: [{
        service: 'conversionActions',
        operations: [{ update: { resourceName, status: 'HIDDEN' }, updateMask: 'status' }]
      }]
    })

    expect(buildSearchGoogleAdsAction(context(
      'remove_conversion_action', 'conversion_action', { resourceName }, current
    ))).toMatchObject({
      resourceName,
      desiredState: { resourceName, status: 'REMOVED' },
      providerOperations: [{ service: 'conversionActions', operations: [{ remove: resourceName }] }]
    })
  })

  it('rejects conversion-action archive and removal when already in the requested terminal state', () => {
    const resourceName = 'customers/1234567890/conversionActions/9001'
    const state = {
      resourceName,
      name: 'Finance enquiry',
      type: 'WEBPAGE',
      category: 'SUBMIT_LEAD_FORM',
      origin: 'WEBSITE',
      primaryForGoal: false,
      includeInConversionsMetric: false
    }
    expect(() => buildSearchGoogleAdsAction(context(
      'archive_conversion_action', 'conversion_action', { resourceName }, { ...state, status: 'HIDDEN' }
    ))).toThrow('already archived')
    expect(() => buildSearchGoogleAdsAction(context(
      'remove_conversion_action', 'conversion_action', { resourceName }, { ...state, status: 'REMOVED' }
    ))).toThrow('already removed')
  })

  it('creates a typed custom conversion goal from a unique tenant-bound action set', () => {
    const first = 'customers/1234567890/conversionActions/9001'
    const second = 'customers/1234567890/conversionActions/9002'
    expect(buildSearchGoogleAdsAction(context(
      'create_custom_conversion_goal',
      'custom_conversion_goal',
      { name: 'Qualified dealer leads', conversionActionResourceNames: [second, first] },
      { exists: false }
    ))).toEqual({
      resourceName: null,
      desiredState: {
        name: 'Qualified dealer leads',
        status: 'ENABLED',
        conversionActions: [first, second]
      },
      providerOperations: [{
        service: 'customConversionGoals',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ create: {
          name: 'Qualified dealer leads',
          status: 'ENABLED',
          conversionActions: [first, second]
        } }]
      }]
    })
  })

  it('rejects duplicate, empty, and cross-tenant custom conversion-goal action sets', () => {
    const resourceName = 'customers/1234567890/conversionActions/9001'
    expect(() => parseSearchGoogleAdsArguments('create_custom_conversion_goal', {
      name: 'Qualified dealer leads', conversionActionResourceNames: []
    })).toThrow()
    expect(() => parseSearchGoogleAdsArguments('create_custom_conversion_goal', {
      name: 'Qualified dealer leads', conversionActionResourceNames: [resourceName, resourceName]
    })).toThrow('must be unique')
    expect(() => buildSearchGoogleAdsAction(context(
      'create_custom_conversion_goal', 'custom_conversion_goal', {
        name: 'Qualified dealer leads',
        conversionActionResourceNames: ['customers/9999999999/conversionActions/9001']
      }, { exists: false }
    ))).toThrow('selected Google Ads customer')
  })

  it('updates only requested custom conversion-goal fields with an exact mask', () => {
    const resourceName = 'customers/1234567890/customConversionGoals/9101'
    const oldAction = 'customers/1234567890/conversionActions/9001'
    const newAction = 'customers/1234567890/conversionActions/9002'
    expect(buildSearchGoogleAdsAction(context(
      'update_custom_conversion_goal', 'custom_conversion_goal', {
        resourceName,
        name: 'Sales-qualified dealer leads',
        conversionActionResourceNames: [newAction]
      }, {
        resourceName,
        name: 'Qualified dealer leads',
        status: 'ENABLED',
        conversionActions: [oldAction]
      }
    ))).toEqual({
      resourceName,
      desiredState: {
        resourceName,
        name: 'Sales-qualified dealer leads',
        conversionActions: [newAction]
      },
      providerOperations: [{
        service: 'customConversionGoals',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{
          update: {
            resourceName,
            name: 'Sales-qualified dealer leads',
            conversionActions: [newAction]
          },
          updateMask: 'name,conversion_actions'
        }]
      }]
    })
  })

  it('archives custom conversion goals through provider removal', () => {
    const resourceName = 'customers/1234567890/customConversionGoals/9101'
    const built = buildSearchGoogleAdsAction(context(
      'archive_custom_conversion_goal', 'custom_conversion_goal', { resourceName }, {
        resourceName,
        name: 'Qualified dealer leads',
        status: 'ENABLED',
        conversionActions: ['customers/1234567890/conversionActions/9001']
      }
    ))
    expect(built).toEqual({
      resourceName,
      desiredState: { resourceName, status: 'REMOVED' },
      providerOperations: [{
        service: 'customConversionGoals',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ remove: resourceName }]
      }]
    })
  })

  it('rejects empty, unchanged, or removed custom conversion-goal updates', () => {
    const resourceName = 'customers/1234567890/customConversionGoals/9101'
    const action = 'customers/1234567890/conversionActions/9001'
    const state = {
      resourceName, name: 'Qualified dealer leads', status: 'ENABLED', conversionActions: [action]
    }
    expect(() => parseSearchGoogleAdsArguments('update_custom_conversion_goal', { resourceName }))
      .toThrow('At least one mutable custom conversion-goal field is required')
    expect(() => buildSearchGoogleAdsAction(context(
      'update_custom_conversion_goal', 'custom_conversion_goal', {
        resourceName, conversionActionResourceNames: [action]
      }, state
    ))).toThrow('already matches')
    expect(() => buildSearchGoogleAdsAction(context(
      'archive_custom_conversion_goal', 'custom_conversion_goal', { resourceName }, {
        ...state, status: 'REMOVED'
      }
    ))).toThrow('already archived')
  })

  it('creates a typed custom audience with every supported member type', () => {
    const built = buildSearchGoogleAdsAction(context(
      'manage_custom_audience',
      'custom_audience',
      {
        action: 'create',
        name: 'Northern GAC intent',
        description: 'People researching GAC vehicles',
        type: 'SEARCH',
        members: [
          { type: 'KEYWORD', value: 'GAC SUV' },
          { type: 'URL', value: 'https://example.com/gac' },
          { type: 'APP', value: 'au.com.example.gac' },
          { type: 'PLACE_CATEGORY', value: '1001' }
        ]
      },
      { exists: false }
    ))

    expect(built).toEqual({
      resourceName: null,
      desiredState: {
        name: 'Northern GAC intent',
        description: 'People researching GAC vehicles',
        type: 'SEARCH',
        status: 'ENABLED',
        members: [
          { type: 'APP', value: 'au.com.example.gac' },
          { type: 'KEYWORD', value: 'GAC SUV' },
          { type: 'PLACE_CATEGORY', value: '1001' },
          { type: 'URL', value: 'https://example.com/gac' }
        ]
      },
      providerOperations: [{
        service: 'customAudiences',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ create: {
          name: 'Northern GAC intent',
          description: 'People researching GAC vehicles',
          type: 'SEARCH',
          members: [
            { memberType: 'APP', app: 'au.com.example.gac' },
            { memberType: 'KEYWORD', keyword: 'GAC SUV' },
            { memberType: 'PLACE_CATEGORY', placeCategory: '1001' },
            { memberType: 'URL', url: 'https://example.com/gac' }
          ]
        } }]
      }]
    })
  })

  it('updates only changed custom-audience fields and replaces members exactly', () => {
    const resourceName = 'customers/1234567890/customAudiences/8001'
    const built = buildSearchGoogleAdsAction(context(
      'manage_custom_audience',
      'custom_audience',
      {
        action: 'update',
        resourceName,
        description: 'Updated intent audience',
        members: [
          { type: 'URL', value: 'https://example.com/new' },
          { type: 'KEYWORD', value: 'new GAC' }
        ]
      },
      {
        resourceName,
        name: 'Northern GAC intent',
        description: 'Old description',
        type: 'SEARCH',
        status: 'ENABLED',
        members: [{ type: 'KEYWORD', value: 'old GAC' }]
      }
    ))

    expect(built).toEqual({
      resourceName,
      desiredState: {
        resourceName,
        description: 'Updated intent audience',
        members: [
          { type: 'KEYWORD', value: 'new GAC' },
          { type: 'URL', value: 'https://example.com/new' }
        ]
      },
      providerOperations: [{
        service: 'customAudiences',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{
          update: {
            resourceName,
            description: 'Updated intent audience',
            members: [
              { memberType: 'KEYWORD', keyword: 'new GAC' },
              { memberType: 'URL', url: 'https://example.com/new' }
            ]
          },
          updateMask: 'description,members'
        }]
      }]
    })
  })

  it('archives a custom audience through provider removal with REMOVED readback intent', () => {
    const resourceName = 'customers/1234567890/customAudiences/8001'
    const built = buildSearchGoogleAdsAction(context(
      'archive_custom_audience',
      'custom_audience',
      { resourceName },
      {
        resourceName,
        name: 'Northern GAC intent',
        description: '',
        type: 'AUTO',
        status: 'ENABLED',
        members: [{ type: 'KEYWORD', value: 'GAC' }]
      }
    ))

    expect(built).toEqual({
      resourceName,
      desiredState: { resourceName, status: 'REMOVED' },
      providerOperations: [{
        service: 'customAudiences',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ remove: resourceName }]
      }]
    })
  })

  it('rejects duplicate, malformed, empty, and unchanged custom-audience mutations', () => {
    const resourceName = 'customers/1234567890/customAudiences/8001'
    expect(() => parseSearchGoogleAdsArguments('manage_custom_audience', {
      action: 'create',
      name: 'Invalid audience',
      type: 'AUTO',
      members: [
        { type: 'KEYWORD', value: 'GAC' },
        { type: 'KEYWORD', value: 'GAC' }
      ]
    })).toThrow('Custom-audience members must be unique')
    expect(() => parseSearchGoogleAdsArguments('manage_custom_audience', {
      action: 'create',
      name: 'Invalid audience',
      type: 'AUTO',
      members: [{ type: 'URL', value: 'javascript:alert(1)' }]
    })).toThrow()
    expect(() => parseSearchGoogleAdsArguments('manage_custom_audience', {
      action: 'update', resourceName
    })).toThrow('At least one mutable custom-audience field is required')
    expect(() => buildSearchGoogleAdsAction(context(
      'manage_custom_audience',
      'custom_audience',
      { action: 'update', resourceName, name: 'Northern GAC intent' },
      {
        resourceName,
        name: 'Northern GAC intent',
        description: '',
        type: 'SEARCH',
        status: 'ENABLED',
        members: [{ type: 'KEYWORD', value: 'GAC' }]
      }
    ))).toThrow('Custom audience already matches the requested values')
  })

  it('atomically replaces Performance Max audience signals without touching other signal types', () => {
    const assetGroup = 'customers/1234567890/assetGroups/7001'
    const oldAudienceSignal = 'customers/1234567890/assetGroupSignals/7001~8101'
    const oldAudience = 'customers/1234567890/audiences/9001'
    const newAudience = 'customers/1234567890/audiences/9002'
    const built = buildSearchGoogleAdsAction(context(
      'set_pmax_signals',
      'audience',
      { assetGroupResourceName: assetGroup, audienceResourceNames: [newAudience] },
      {
        assetGroupResourceName: assetGroup,
        audienceSignals: [{ resourceName: oldAudienceSignal, audienceResourceName: oldAudience }]
      }
    ))

    expect(built).toEqual({
      resourceName: assetGroup,
      desiredState: {
        assetGroupResourceName: assetGroup,
        audienceSignals: [{ audienceResourceName: newAudience }]
      },
      providerOperations: [{
        service: 'assetGroupSignals',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [
          { create: { assetGroup, audience: { audience: newAudience } } },
          { remove: oldAudienceSignal }
        ]
      }]
    })
  })

  it('normalizes and atomically replaces Performance Max search themes', () => {
    const assetGroup = 'customers/1234567890/assetGroups/7001'
    const oldSignal = 'customers/1234567890/assetGroupSignals/7001~8201'
    const built = buildSearchGoogleAdsAction(context(
      'set_search_themes',
      'search_theme',
      { assetGroupResourceName: assetGroup, themes: ['  GAC   SUV ', 'New vehicles'] },
      {
        assetGroupResourceName: assetGroup,
        searchThemes: [{ resourceName: oldSignal, text: 'Old vehicles', approvalStatus: 'APPROVED' }]
      }
    ))

    expect(built).toEqual({
      resourceName: assetGroup,
      desiredState: {
        assetGroupResourceName: assetGroup,
        searchThemes: [{ text: 'GAC SUV' }, { text: 'New vehicles' }]
      },
      providerOperations: [{
        service: 'assetGroupSignals',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [
          { create: { assetGroup, searchTheme: { text: 'GAC SUV' } } },
          { create: { assetGroup, searchTheme: { text: 'New vehicles' } } },
          { remove: oldSignal }
        ]
      }]
    })
  })

  it('rejects duplicate, oversized, cross-tenant, and unchanged Performance Max signals', () => {
    const assetGroup = 'customers/1234567890/assetGroups/7001'
    expect(() => parseSearchGoogleAdsArguments('set_search_themes', {
      assetGroupResourceName: assetGroup,
      themes: ['GAC SUV', 'gac   suv']
    })).toThrow('Search themes must be unique')
    expect(() => parseSearchGoogleAdsArguments('set_search_themes', {
      assetGroupResourceName: assetGroup,
      themes: Array.from({ length: 26 }, (_, index) => `theme ${index}`)
    })).toThrow()
    expect(() => buildSearchGoogleAdsAction(context(
      'set_pmax_signals',
      'audience',
      {
        assetGroupResourceName: assetGroup,
        audienceResourceNames: ['customers/9999999999/audiences/9002']
      },
      { assetGroupResourceName: assetGroup, audienceSignals: [] }
    ))).toThrow('selected Google Ads customer')
    expect(() => buildSearchGoogleAdsAction(context(
      'set_search_themes',
      'search_theme',
      { assetGroupResourceName: assetGroup, themes: ['GAC SUV'] },
      { assetGroupResourceName: assetGroup, searchThemes: [{ text: 'gac suv' }] }
    ))).toThrow('Search themes already match the requested values')
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

  it('creates immutable typed call, sitelink, callout, and structured-snippet assets', () => {
    expect(buildSearchGoogleAdsAction(context(
      'create_asset',
      'asset',
      {
        type: 'CALL',
        name: 'Northern GAC calls',
        countryCode: 'au',
        phoneNumber: '(03) 9999 0000'
      },
      { exists: false }
    ))).toEqual({
      resourceName: null,
      desiredState: {
        type: 'CALL',
        name: 'Northern GAC calls',
        callAsset: { countryCode: 'AU', phoneNumber: '(03) 9999 0000' }
      },
      providerOperations: [{
        service: 'assets',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{
          create: {
            name: 'Northern GAC calls',
            callAsset: { countryCode: 'AU', phoneNumber: '(03) 9999 0000' }
          }
        }]
      }]
    })

    expect(buildSearchGoogleAdsAction(context(
      'create_asset',
      'asset',
      {
        type: 'SITELINK',
        linkText: 'Book a test drive',
        description1: 'Drive a new GAC today',
        description2: 'Choose your preferred model',
        finalUrl: 'https://example.com/test-drive'
      },
      { exists: false }
    )).desiredState).toEqual({
      type: 'SITELINK',
      finalUrls: ['https://example.com/test-drive'],
      finalMobileUrls: [],
      sitelinkAsset: {
        linkText: 'Book a test drive',
        description1: 'Drive a new GAC today',
        description2: 'Choose your preferred model'
      }
    })

    expect(buildSearchGoogleAdsAction(context(
      'create_asset', 'asset', { type: 'CALLOUT', calloutText: 'Available now' }, { exists: false }
    )).desiredState).toEqual({ type: 'CALLOUT', calloutAsset: { calloutText: 'Available now' } })

    expect(buildSearchGoogleAdsAction(context(
      'create_asset',
      'asset',
      { type: 'STRUCTURED_SNIPPET', header: 'Models', values: ['Aion V', 'Emkoo', 'GS3 Emzoom'] },
      { exists: false }
    )).desiredState).toEqual({
      type: 'STRUCTURED_SNIPPET',
      structuredSnippetAsset: { header: 'Models', values: ['Aion V', 'Emkoo', 'GS3 Emzoom'] }
    })
  })

  it('rejects invalid extension-asset shapes before mutation planning', () => {
    expect(() => parseSearchGoogleAdsArguments('create_asset', {
      type: 'SITELINK', linkText: 'Test drive', description1: 'Only one description', finalUrl: 'https://example.com'
    })).toThrow('Sitelink descriptions must be supplied together')
    expect(() => parseSearchGoogleAdsArguments('create_asset', {
      type: 'CALLOUT', calloutText: 'x'.repeat(26)
    })).toThrow()
    expect(() => parseSearchGoogleAdsArguments('create_asset', {
      type: 'STRUCTURED_SNIPPET', header: 'Models', values: ['A', 'B']
    })).toThrow()
    expect(() => parseSearchGoogleAdsArguments('create_asset', {
      type: 'CALL', countryCode: 'AUS', phoneNumber: '03 9999 0000'
    })).toThrow()
  })

  it('attaches or resumes a typed campaign asset link', () => {
    const parentResourceName = 'customers/1234567890/campaigns/60'
    const assetResourceName = 'customers/1234567890/assets/9201'
    const resourceName = 'customers/1234567890/campaignAssets/60~9201~CALL'
    const input = {
      scope: 'campaign', parentResourceName, assetResourceName, fieldType: 'CALL'
    } as const
    expect(buildSearchGoogleAdsAction(context('attach_asset', 'asset_link', input, {
      resourceName,
      scope: 'campaign',
      parentResourceName,
      assetResourceName,
      fieldType: 'CALL',
      assetType: 'CALL',
      status: 'ABSENT'
    }))).toEqual({
      resourceName,
      desiredState: {
        resourceName,
        scope: 'campaign',
        parentResourceName,
        assetResourceName,
        fieldType: 'CALL',
        status: 'ENABLED'
      },
      providerOperations: [{
        service: 'campaignAssets',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [{ create: {
          campaign: parentResourceName,
          asset: assetResourceName,
          fieldType: 'CALL',
          status: 'ENABLED'
        } }]
      }]
    })

    expect(buildSearchGoogleAdsAction(context('attach_asset', 'asset_link', input, {
      resourceName,
      scope: 'campaign',
      parentResourceName,
      assetResourceName,
      fieldType: 'CALL',
      assetType: 'CALL',
      status: 'PAUSED'
    })).providerOperations[0]?.operations).toEqual([{
      update: { resourceName, status: 'ENABLED' },
      updateMask: 'status'
    }])
  })

  it('archives asset links reversibly and detaches only when explicit', () => {
    const resourceName = 'customers/1234567890/campaignAssets/60~9201~CALL'
    const current = {
      resourceName,
      scope: 'campaign',
      parentResourceName: 'customers/1234567890/campaigns/60',
      assetResourceName: 'customers/1234567890/assets/9201',
      fieldType: 'CALL',
      status: 'ENABLED'
    }
    expect(buildSearchGoogleAdsAction(context(
      'archive_asset_link', 'asset_link', { scope: 'campaign', resourceName }, current
    )).providerOperations[0]?.operations).toEqual([{
      update: { resourceName, status: 'PAUSED' },
      updateMask: 'status'
    }])
    expect(buildSearchGoogleAdsAction(context(
      'detach_asset', 'asset_link', { scope: 'campaign', resourceName }, current
    )).providerOperations[0]?.operations).toEqual([{ remove: resourceName }])
  })

  it('rejects cross-customer and field-type mismatched asset links', () => {
    expect(() => buildSearchGoogleAdsAction(context('attach_asset', 'asset_link', {
      scope: 'campaign',
      parentResourceName: 'customers/1234567890/campaigns/60',
      assetResourceName: 'customers/9999999999/assets/9201',
      fieldType: 'CALL'
    }, {
      resourceName: 'customers/1234567890/campaignAssets/60~9201~CALL',
      scope: 'campaign',
      parentResourceName: 'customers/1234567890/campaigns/60',
      assetResourceName: 'customers/1234567890/assets/9201',
      fieldType: 'CALL',
      assetType: 'CALL',
      status: 'ABSENT'
    }))).toThrow('selected Google Ads customer')
    expect(() => buildSearchGoogleAdsAction(context('attach_asset', 'asset_link', {
      scope: 'campaign',
      parentResourceName: 'customers/1234567890/campaigns/60',
      assetResourceName: 'customers/1234567890/assets/9201',
      fieldType: 'SITELINK'
    }, {
      resourceName: 'customers/1234567890/campaignAssets/60~9201~SITELINK',
      scope: 'campaign',
      parentResourceName: 'customers/1234567890/campaigns/60',
      assetResourceName: 'customers/1234567890/assets/9201',
      fieldType: 'SITELINK',
      assetType: 'CALL',
      status: 'ABSENT'
    }))).toThrow('does not match')
  })

  it('creates a paused standard Performance Max asset group and required links atomically', () => {
    const campaignResourceName = 'customers/1234567890/campaigns/60'
    const links = [
      ['HEADLINE', '7001'], ['HEADLINE', '7002'], ['HEADLINE', '7003'],
      ['LONG_HEADLINE', '7004'], ['DESCRIPTION', '7005'], ['DESCRIPTION', '7006'],
      ['MARKETING_IMAGE', '7007'], ['SQUARE_MARKETING_IMAGE', '7008']
    ].map(([fieldType, id]) => ({
      fieldType,
      assetResourceName: `customers/1234567890/assets/${id}`
    }))
    const current = {
      campaign: {
        resourceName: campaignResourceName,
        advertisingChannelType: 'PERFORMANCE_MAX',
        brandGuidelinesEnabled: true,
        merchantId: null
      },
      nameAvailable: true,
      assets: links.map(link => ({
        resourceName: link.assetResourceName,
        type: ['MARKETING_IMAGE', 'SQUARE_MARKETING_IMAGE'].includes(link.fieldType) ? 'IMAGE' : 'TEXT'
      }))
    }
    const sortedLinks = [...links].sort((left, right) => (
      left.fieldType.localeCompare(right.fieldType)
      || left.assetResourceName.localeCompare(right.assetResourceName)
    ))

    const built = buildSearchGoogleAdsAction(context('create_asset_group', 'asset_group', {
      campaignResourceName,
      name: 'SUV range',
      finalUrls: ['https://example.com/suv'],
      path1: 'suv',
      assets: links
    }, current))

    expect(built.resourceName).toBeNull()
    expect(built.desiredState).toEqual({
      campaign: campaignResourceName,
      name: 'SUV range',
      finalUrls: ['https://example.com/suv'],
      finalMobileUrls: [],
      path1: 'suv',
      status: 'PAUSED',
      assets: sortedLinks
    })
    expect(built.providerOperations).toHaveLength(1)
    expect(built.providerOperations[0]).toMatchObject({
      service: 'googleAds',
      atomicity: 'interdependent',
      partialFailure: false
    })
    expect(built.providerOperations[0]?.operations[0]).toEqual({ mutate: {
      assetGroupOperation: { create: {
        resourceName: 'customers/1234567890/assetGroups/-1',
        campaign: campaignResourceName,
        name: 'SUV range',
        finalUrls: ['https://example.com/suv'],
        status: 'PAUSED',
        path1: 'suv'
      } }
    } })
    expect(built.providerOperations[0]?.operations.slice(1)).toEqual(sortedLinks.map(link => ({ mutate: {
      assetGroupAssetOperation: { create: {
        assetGroup: 'customers/1234567890/assetGroups/-1',
        asset: link.assetResourceName,
        fieldType: link.fieldType
      } }
    } })))
  })

  it('allows a retail Performance Max asset group with no advertiser assets', () => {
    const campaignResourceName = 'customers/1234567890/campaigns/60'
    const built = buildSearchGoogleAdsAction(context('create_asset_group', 'asset_group', {
      campaignResourceName,
      name: 'All products',
      finalUrls: ['https://example.com/shop'],
      assets: []
    }, {
      campaign: {
        resourceName: campaignResourceName,
        advertisingChannelType: 'PERFORMANCE_MAX',
        brandGuidelinesEnabled: true,
        merchantId: '12345'
      },
      nameAvailable: true,
      assets: []
    }))
    expect(built.providerOperations[0]?.operations).toHaveLength(1)
  })

  it('rejects invalid or incomplete Performance Max asset-group bundles', () => {
    const campaignResourceName = 'customers/1234567890/campaigns/60'
    const baseState = {
      campaign: {
        resourceName: campaignResourceName,
        advertisingChannelType: 'PERFORMANCE_MAX',
        brandGuidelinesEnabled: true,
        merchantId: null
      },
      nameAvailable: true,
      assets: [{ resourceName: 'customers/1234567890/assets/7001', type: 'TEXT' }]
    }
    expect(() => buildSearchGoogleAdsAction(context('create_asset_group', 'asset_group', {
      campaignResourceName,
      name: 'Incomplete',
      finalUrls: ['https://example.com'],
      assets: [{ fieldType: 'HEADLINE', assetResourceName: 'customers/1234567890/assets/7001' }]
    }, baseState))).toThrow('at least 3 HEADLINE')
    expect(() => buildSearchGoogleAdsAction(context('create_asset_group', 'asset_group', {
      campaignResourceName,
      name: 'Wrong asset type',
      finalUrls: ['https://example.com'],
      assets: [
        { fieldType: 'MARKETING_IMAGE', assetResourceName: 'customers/1234567890/assets/7001' }
      ]
    }, baseState))).toThrow('does not match')
    expect(() => parseSearchGoogleAdsArguments('create_asset_group', {
      campaignResourceName,
      name: 'Unsafe URL',
      finalUrls: ['http://example.com'],
      assets: []
    })).toThrow()
  })
})
