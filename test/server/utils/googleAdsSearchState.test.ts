import { describe, expect, it, vi } from 'vitest'
import type { BuildGoogleAdsActionContext } from '~~/server/utils/googleAds/actionPlanner'
import {
  loadSearchGoogleAdsPlanState,
  loadSearchGoogleAdsCurrentState,
  verifySearchGoogleAdsState
} from '~~/server/utils/googleAds/searchState'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'

const auth = { accessToken: 'access', developerToken: 'developer', loginCustomerId: '9999999999' }

function context(operation: BuildGoogleAdsActionContext['input']['operation'], args: unknown): Omit<BuildGoogleAdsActionContext, 'currentState'> {
  return {
    input: {
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      actorId: '33333333-3333-4333-8333-333333333333',
      source: 'mcp',
      operation,
      resourceType: operation === 'add_negative_keywords' ? 'negative_keyword' : 'campaign',
      requestedMode: 'proposal',
      arguments: args,
      idempotencyKey: 'search-state-1'
    },
    connection: {
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      customerId: '1234567890',
      platform: 'google',
      status: 'active'
    },
    customerId: '1234567890'
  }
}

describe('Search Google Ads current-state loader', () => {
  it('loads one campaign status through a bounded server-authored query', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ campaign: { resourceName: 'customers/1234567890/campaigns/10', status: 'ENABLED' } }],
      more: 0
    })

    await expect(loadSearchGoogleAdsCurrentState(
      context('pause_campaign', { resourceName: 'customers/1234567890/campaigns/10' }),
      auth,
      { query }
    )).resolves.toEqual({
      resourceName: 'customers/1234567890/campaigns/10',
      status: 'ENABLED'
    })

    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      customerId: '1234567890',
      auth,
      maxRows: 1,
      query: expect.stringContaining('campaign.id = 10')
    }))
    expect(query.mock.calls[0]?.[0].query).not.toContain('customers/1234567890/campaigns/10')
  })

  it('loads and normalizes existing campaign negatives with a hard row cap', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { campaignCriterion: { negative: true, keyword: { text: 'jobs', matchType: 'PHRASE' } } },
        { campaignCriterion: { negative: true, keyword: { text: 'Free', matchType: 'EXACT' } } }
      ],
      more: 0
    })

    await expect(loadSearchGoogleAdsCurrentState(context('add_negative_keywords', {
      scope: 'campaign',
      parentResourceName: 'customers/1234567890/campaigns/10',
      keywords: [{ text: 'cheap', matchType: 'BROAD' }]
    }), auth, { query })).resolves.toEqual({
      criteria: [
        { text: 'Free', matchType: 'EXACT', negative: true },
        { text: 'jobs', matchType: 'PHRASE', negative: true }
      ]
    })

    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      maxRows: 10_000,
      query: expect.stringContaining('campaign_criterion.campaign = \'customers/1234567890/campaigns/10\'')
    }))
  })

  it('fails closed when a status resource cannot be found', async () => {
    await expect(loadSearchGoogleAdsCurrentState(
      context('pause_campaign', { resourceName: 'customers/1234567890/campaigns/10' }),
      auth,
      { query: vi.fn().mockResolvedValue({ rows: [], more: 0 }) }
    )).rejects.toThrow('was not found')
  })

  it('checks budget names before planning creation', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], more: 0 })
    await expect(loadSearchGoogleAdsCurrentState(context('create_budget', {
      name: 'Northern Search Budget',
      dailyAmount: 40
    }), auth, { query })).resolves.toEqual({ exists: false })
    expect(query.mock.calls[0]?.[0]).toMatchObject({ maxRows: 1 })
    expect(query.mock.calls[0]?.[0].query).toContain('campaign_budget.name = \'Northern Search Budget\'')
  })

  it('refuses to plan a duplicate named budget', async () => {
    await expect(loadSearchGoogleAdsCurrentState(context('create_budget', {
      name: 'Northern Search Budget',
      dailyAmount: 40
    }), auth, {
      query: vi.fn().mockResolvedValue({
        rows: [{ campaignBudget: { resourceName: 'customers/1234567890/campaignBudgets/50' } }],
        more: 0
      })
    })).rejects.toThrow('already exists')
  })

  it('loads the governed budget fields before planning a budget update', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ campaignBudget: {
        resourceName: 'customers/1234567890/campaignBudgets/50',
        name: 'Northern Search Budget',
        amountMicros: '40000000',
        deliveryMethod: 'STANDARD',
        explicitlyShared: false
      } }],
      more: 0
    })

    await expect(loadSearchGoogleAdsCurrentState(context('update_budget', {
      resourceName: 'customers/1234567890/campaignBudgets/50',
      dailyAmount: 55
    }), auth, { query })).resolves.toMatchObject({
      resourceName: 'customers/1234567890/campaignBudgets/50',
      amountMicros: '40000000'
    })
    expect(query.mock.calls[0]?.[0].query).toContain('campaign_budget.id = 50')
  })

  it('checks campaign names and the referenced budget before planning creation', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], more: 0 })
      .mockResolvedValueOnce({
        rows: [{ campaignBudget: { resourceName: 'customers/1234567890/campaignBudgets/50' } }],
        more: 0
      })

    await expect(loadSearchGoogleAdsCurrentState(context('create_campaign', {
      name: 'Northern Search',
      budgetResourceName: 'customers/1234567890/campaignBudgets/50'
    }), auth, { query })).resolves.toEqual({
      exists: false,
      campaignBudgetResourceName: 'customers/1234567890/campaignBudgets/50'
    })
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0]?.[0].query).toContain('campaign.name = \'Northern Search\'')
    expect(query.mock.calls[1]?.[0].query).toContain('campaign_budget.id = 50')
  })

  it('refuses campaign creation when the referenced budget is missing', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], more: 0 })
      .mockResolvedValueOnce({ rows: [], more: 0 })

    await expect(loadSearchGoogleAdsCurrentState(context('create_campaign', {
      name: 'Northern Search',
      budgetResourceName: 'customers/1234567890/campaignBudgets/50'
    }), auth, { query })).rejects.toThrow('referenced campaign budget was not found')
  })

  it('checks ad group names within a live parent campaign before planning creation', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], more: 0 })
      .mockResolvedValueOnce({
        rows: [{ campaign: { resourceName: 'customers/1234567890/campaigns/60' } }],
        more: 0
      })

    await expect(loadSearchGoogleAdsCurrentState(context('create_ad_group', {
      name: 'New Vehicles',
      campaignResourceName: 'customers/1234567890/campaigns/60',
      cpcBid: 3.5
    }), auth, { query })).resolves.toEqual({
      exists: false,
      campaignResourceName: 'customers/1234567890/campaigns/60'
    })
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0]?.[0].query).toContain('ad_group.name = \'New Vehicles\'')
    expect(query.mock.calls[0]?.[0].query).toContain('campaign.id = 60')
    expect(query.mock.calls[1]?.[0].query).toContain('campaign.id = 60')
  })

  it('requires a live parent ad group before planning a responsive search ad', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ adGroup: { resourceName: 'customers/1234567890/adGroups/70' } }],
      more: 0
    })

    await expect(loadSearchGoogleAdsCurrentState(context('create_ad', {
      adGroupResourceName: 'customers/1234567890/adGroups/70',
      finalUrl: 'https://northerngac.com.au/vehicles',
      headlines: ['Northern GAC', 'Explore New Vehicles', 'Book a Test Drive'],
      descriptions: ['Discover the latest GAC range.', 'Enquire with Northern GAC today.']
    }), auth, { query })).resolves.toEqual({
      adGroupResourceName: 'customers/1234567890/adGroups/70'
    })
    expect(query.mock.calls[0]?.[0].query).toContain('ad_group.id = 70')
  })

  it('loads and normalizes existing positive keywords from a live ad group', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ adGroup: { resourceName: 'customers/1234567890/adGroups/70' } }],
        more: 0
      })
      .mockResolvedValueOnce({
        rows: [
          { adGroupCriterion: {
            negative: false,
            status: 'ENABLED',
            keyword: { text: 'GAC dealer', matchType: 'PHRASE' }
          } },
          { adGroupCriterion: {
            negative: false,
            status: 'PAUSED',
            keyword: { text: 'Northern GAC', matchType: 'EXACT' }
          } }
        ],
        more: 0
      })

    await expect(loadSearchGoogleAdsCurrentState(context('add_keywords', {
      adGroupResourceName: 'customers/1234567890/adGroups/70',
      keywords: [{ text: 'new vehicles', matchType: 'BROAD' }]
    }), auth, { query })).resolves.toEqual({
      adGroupResourceName: 'customers/1234567890/adGroups/70',
      criteria: [
        { text: 'Northern GAC', matchType: 'EXACT', negative: false, status: 'PAUSED' },
        { text: 'GAC dealer', matchType: 'PHRASE', negative: false, status: 'ENABLED' }
      ]
    })
    expect(query.mock.calls[1]?.[0]).toMatchObject({ maxRows: 10_000 })
    expect(query.mock.calls[1]?.[0].query).toContain('ad_group_criterion.negative = FALSE')
  })

  it('loads a bounded sorted campaign location set after validating its parent', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ campaign: { resourceName: 'customers/1234567890/campaigns/60' } }],
        more: 0
      })
      .mockResolvedValueOnce({
        rows: [
          { campaignCriterion: {
            resourceName: 'customers/1234567890/campaignCriteria/60~2',
            negative: false,
            location: { geoTargetConstant: 'geoTargetConstants/200' }
          } },
          { campaignCriterion: {
            resourceName: 'customers/1234567890/campaignCriteria/60~1',
            negative: false,
            location: { geoTargetConstant: 'geoTargetConstants/100' }
          } }
        ],
        more: 0
      })

    await expect(loadSearchGoogleAdsCurrentState(context('set_locations', {
      campaignResourceName: 'customers/1234567890/campaigns/60',
      geoTargetConstantIds: ['200', '300']
    }), auth, { query })).resolves.toEqual({
      campaignResourceName: 'customers/1234567890/campaigns/60',
      locationIds: ['100', '200'],
      criteria: {
        100: 'customers/1234567890/campaignCriteria/60~1',
        200: 'customers/1234567890/campaignCriteria/60~2'
      }
    })
    expect(query.mock.calls[1]?.[0]).toMatchObject({ maxRows: 10_000 })
    expect(query.mock.calls[1]?.[0].query).toContain('campaign_criterion.type = \'LOCATION\'')
  })

  it('loads the current campaign positive geo-target mode with a bounded read', async () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const query = vi.fn().mockResolvedValue({
      rows: [{ campaign: {
        resourceName: campaign,
        geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE_OR_INTEREST' }
      } }],
      more: 0
    })

    await expect(loadSearchGoogleAdsCurrentState(context('set_location_match_mode', {
      campaignResourceName: campaign,
      positiveGeoTargetType: 'PRESENCE'
    }), auth, { query })).resolves.toEqual({
      campaignResourceName: campaign,
      positiveGeoTargetType: 'PRESENCE_OR_INTEREST'
    })
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      maxRows: 1,
      query: expect.stringContaining('campaign.geo_target_type_setting.positive_geo_target_type')
    }))
    expect(query.mock.calls[0]?.[0].query).toContain('campaign.id = 60')
  })

  it('loads a bounded sorted campaign language set after validating its parent', async () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ campaign: { resourceName: campaign } }], more: 0 })
      .mockResolvedValueOnce({
        rows: [
          { campaignCriterion: {
            resourceName: 'customers/1234567890/campaignCriteria/60~11',
            negative: false,
            language: { languageConstant: 'languageConstants/1001' }
          } },
          { campaignCriterion: {
            resourceName: 'customers/1234567890/campaignCriteria/60~10',
            negative: false,
            language: { languageConstant: 'languageConstants/1000' }
          } }
        ],
        more: 0
      })

    await expect(loadSearchGoogleAdsCurrentState(context('set_languages', {
      campaignResourceName: campaign,
      languageConstantIds: ['1000']
    }), auth, { query })).resolves.toEqual({
      campaignResourceName: campaign,
      languageIds: ['1000', '1001'],
      criteria: {
        1000: 'customers/1234567890/campaignCriteria/60~10',
        1001: 'customers/1234567890/campaignCriteria/60~11'
      }
    })
    expect(query.mock.calls[1]?.[0]).toMatchObject({ maxRows: 10_000 })
    expect(query.mock.calls[1]?.[0].query).toContain('campaign_criterion.type = \'LANGUAGE\'')
  })

  it('loads and normalizes the bounded campaign ad schedule set', async () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ campaign: { resourceName: campaign } }], more: 0 })
      .mockResolvedValueOnce({
        rows: [{ campaignCriterion: {
          resourceName: 'customers/1234567890/campaignCriteria/60~20',
          negative: false,
          adSchedule: {
            dayOfWeek: 'MONDAY',
            startHour: 9,
            startMinute: 'ZERO',
            endHour: 17,
            endMinute: 'THIRTY'
          }
        } }],
        more: 0
      })

    await expect(loadSearchGoogleAdsCurrentState(context('set_ad_schedule', {
      campaignResourceName: campaign,
      schedules: [{
        dayOfWeek: 'MONDAY', startHour: 9, startMinute: 0, endHour: 17, endMinute: 30
      }]
    }), auth, { query })).resolves.toEqual({
      campaignResourceName: campaign,
      schedules: [{
        dayOfWeek: 'MONDAY', startHour: 9, startMinute: 0, endHour: 17, endMinute: 30
      }],
      criteria: {
        'MONDAY:09:00-17:30': 'customers/1234567890/campaignCriteria/60~20'
      }
    })
    expect(query.mock.calls[1]?.[0]).toMatchObject({ maxRows: 10_000 })
    expect(query.mock.calls[1]?.[0].query).toContain('campaign_criterion.type = \'AD_SCHEDULE\'')
  })

  it('loads tenant-bound campaign device criteria and bid modifiers', async () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ campaign: { resourceName: campaign } }], more: 0 })
      .mockResolvedValueOnce({
        rows: [
          { campaignCriterion: {
            resourceName: 'customers/1234567890/campaignCriteria/60~31',
            bidModifier: 1.2,
            device: { type: 'DESKTOP' }
          } },
          { campaignCriterion: {
            resourceName: 'customers/1234567890/campaignCriteria/60~30',
            bidModifier: 0,
            device: { type: 'MOBILE' }
          } }
        ],
        more: 0
      })

    await expect(loadSearchGoogleAdsCurrentState(context('set_devices', {
      campaignResourceName: campaign,
      devices: [{ type: 'MOBILE', bidModifier: 1 }]
    }), auth, { query })).resolves.toEqual({
      campaignResourceName: campaign,
      devices: [
        {
          resourceName: 'customers/1234567890/campaignCriteria/60~31',
          type: 'DESKTOP',
          bidModifier: 1.2
        },
        {
          resourceName: 'customers/1234567890/campaignCriteria/60~30',
          type: 'MOBILE',
          bidModifier: 0
        }
      ]
    })
    expect(query.mock.calls[1]?.[0]).toMatchObject({ maxRows: 100 })
    expect(query.mock.calls[1]?.[0].query).toContain('campaign_criterion.type = \'DEVICE\'')
  })

  it('loads typed campaign conversion goals by campaign ID', async () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ campaign: { resourceName: campaign } }], more: 0 })
      .mockResolvedValueOnce({
        rows: [{ campaignConversionGoal: {
          resourceName: 'customers/1234567890/campaignConversionGoals/60~REQUEST_QUOTE~WEBSITE',
          campaign,
          category: 'REQUEST_QUOTE',
          origin: 'WEBSITE',
          biddable: false
        } }],
        more: 0
      })

    await expect(loadSearchGoogleAdsCurrentState(context('set_campaign_conversion_goals', {
      campaignResourceName: campaign,
      goals: [{ category: 'REQUEST_QUOTE', origin: 'WEBSITE', biddable: true }]
    }), auth, { query })).resolves.toEqual({
      campaignResourceName: campaign,
      goals: [{
        resourceName: 'customers/1234567890/campaignConversionGoals/60~REQUEST_QUOTE~WEBSITE',
        category: 'REQUEST_QUOTE',
        origin: 'WEBSITE',
        biddable: false
      }]
    })
    expect(query.mock.calls[1]?.[0]).toMatchObject({ maxRows: 1_000 })
    expect(query.mock.calls[1]?.[0].query).toContain('campaign_conversion_goal.campaign')
  })

  it('loads one tenant-bound customer conversion goal by category and origin', async () => {
    const resourceName = 'customers/1234567890/customerConversionGoals/REQUEST_QUOTE~WEBSITE'
    const query = vi.fn().mockResolvedValue({
      rows: [{ customerConversionGoal: {
        resourceName,
        category: 'REQUEST_QUOTE',
        origin: 'WEBSITE',
        biddable: true
      } }],
      more: 0
    })

    await expect(loadSearchGoogleAdsCurrentState(context('set_customer_goal_biddability', {
      category: 'REQUEST_QUOTE',
      origin: 'WEBSITE',
      biddable: false
    }), auth, { query })).resolves.toEqual({
      resourceName,
      category: 'REQUEST_QUOTE',
      origin: 'WEBSITE',
      biddable: true
    })
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      customerId: '1234567890',
      maxRows: 1,
      query: expect.stringContaining(`customer_conversion_goal.category = 'REQUEST_QUOTE'`)
    }))
    expect(query.mock.calls[0]?.[0].query).toContain(`customer_conversion_goal.origin = 'WEBSITE'`)
  })

  it('loads explicit ad-group age and gender criteria', async () => {
    const adGroup = 'customers/1234567890/adGroups/20'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ adGroup: { resourceName: adGroup } }], more: 0 })
      .mockResolvedValueOnce({ rows: [
        { adGroupCriterion: {
          resourceName: 'customers/1234567890/adGroupCriteria/20~300',
          adGroup,
          negative: false,
          gender: { type: 'MALE' }
        } },
        { adGroupCriterion: {
          resourceName: 'customers/1234567890/adGroupCriteria/20~301',
          adGroup,
          negative: true,
          ageRange: { type: 'AGE_RANGE_18_24' }
        } }
      ], more: 0 })

    await expect(loadSearchGoogleAdsCurrentState(context('set_demographics', {
      adGroupResourceName: adGroup,
      criteria: []
    }), auth, { query })).resolves.toMatchObject({
      adGroupResourceName: adGroup,
      criteria: [
        { dimension: 'AGE_RANGE', type: 'AGE_RANGE_18_24', excluded: true },
        { dimension: 'GENDER', type: 'MALE', excluded: false }
      ]
    })
  })

  it('loads tenant-bound campaign placement exclusions', async () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ campaign: { resourceName: campaign } }], more: 0 })
      .mockResolvedValueOnce({ rows: [{ campaignCriterion: {
        resourceName: 'customers/1234567890/campaignCriteria/60~450',
        campaign,
        negative: true,
        placement: { url: 'https://example.com/excluded' }
      } }], more: 0 })
    await expect(loadSearchGoogleAdsCurrentState(context('set_placements', {
      scope: 'campaign', parentResourceName: campaign, urls: []
    }), auth, { query })).resolves.toMatchObject({
      scope: 'campaign',
      parentResourceName: campaign,
      placements: [{ url: 'https://example.com/excluded' }]
    })
  })

  it('loads campaign content-label exclusions', async () => {
    const campaign = 'customers/1234567890/campaigns/60'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ campaign: { resourceName: campaign } }], more: 0 })
      .mockResolvedValueOnce({ rows: [{ campaignCriterion: {
        resourceName: 'customers/1234567890/campaignCriteria/60~500',
        campaign,
        negative: true,
        contentLabel: { type: 'PROFANITY' }
      } }], more: 0 })
    await expect(loadSearchGoogleAdsCurrentState(context('set_content_exclusions', {
      campaignResourceName: campaign, labels: []
    }), auth, { query })).resolves.toMatchObject({
      campaignResourceName: campaign,
      labels: [{ type: 'PROFANITY' }]
    })
  })

  it('loads grouped audience associations and target mode', async () => {
    const adGroup = 'customers/1234567890/adGroups/20'
    const audience = 'customers/1234567890/audiences/701'
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ adGroup: {
        resourceName: adGroup,
        audienceSetting: { useAudienceGrouped: true },
        targetingSetting: { targetRestrictions: [{ targetingDimension: 'AUDIENCE', bidOnly: true }] }
      } }], more: 0 })
      .mockResolvedValueOnce({ rows: [{ adGroupCriterion: {
        resourceName: 'customers/1234567890/adGroupCriteria/20~600',
        adGroup,
        negative: false,
        audience: { audience }
      } }], more: 0 })
    await expect(loadSearchGoogleAdsCurrentState(context('set_audience_associations', {
      adGroupResourceName: adGroup, audienceResourceNames: [], mode: 'TARGETING'
    }), auth, { query })).resolves.toMatchObject({
      adGroupResourceName: adGroup,
      audienceGrouped: true,
      targetRestrictions: [{ targetingDimension: 'AUDIENCE', bidOnly: true }],
      associations: [{ audienceResourceName: audience }]
    })
  })

  it('loads a tenant-bound conversion action for primary-state changes', async () => {
    const resourceName = 'customers/1234567890/conversionActions/9001'
    const query = vi.fn().mockResolvedValue({
      rows: [{ conversionAction: {
        resourceName,
        name: 'Stock enquiry',
        status: 'ENABLED',
        type: 'WEBPAGE',
        category: 'SUBMIT_LEAD_FORM',
        origin: 'WEBSITE',
        primaryForGoal: true,
        includeInConversionsMetric: true
      } }],
      more: 0
    })

    await expect(loadSearchGoogleAdsCurrentState(context('set_conversion_primary_state', {
      resourceName,
      primaryForGoal: false
    }), auth, { query })).resolves.toMatchObject({
      resourceName,
      primaryForGoal: true
    })
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      maxRows: 1,
      query: expect.stringContaining('conversion_action.id = 9001')
    }))
  })

  it.each(['archive_conversion_action', 'remove_conversion_action'] as const)(
    'loads a tenant-bound conversion action before %s',
    async (operation) => {
      const resourceName = 'customers/1234567890/conversionActions/9001'
      const query = vi.fn().mockResolvedValue({
        rows: [{ conversionAction: {
          resourceName,
          name: 'Finance enquiry',
          status: 'ENABLED',
          type: 'WEBPAGE',
          category: 'SUBMIT_LEAD_FORM',
          origin: 'WEBSITE',
          primaryForGoal: false,
          includeInConversionsMetric: false
        } }],
        more: 0
      })
      await expect(loadSearchGoogleAdsCurrentState(
        context(operation, { resourceName }), auth, { query }
      )).resolves.toMatchObject({ resourceName, status: 'ENABLED' })
    }
  )

  it('checks conversion-action names before planning creation', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], more: 0 })
    await expect(loadSearchGoogleAdsCurrentState(context('create_conversion_action', {
      name: 'Finance enquiry',
      type: 'WEBPAGE',
      category: 'SUBMIT_LEAD_FORM',
      countingType: 'ONE_PER_CLICK'
    }), auth, { query })).resolves.toEqual({ exists: false })
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      maxRows: 1,
      query: expect.stringContaining('conversion_action.name = \'Finance enquiry\'')
    }))
  })

  it('checks custom conversion-goal names before planning creation', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], more: 0 })
    await expect(loadSearchGoogleAdsCurrentState(context('create_custom_conversion_goal', {
      name: 'Qualified dealer leads',
      conversionActionResourceNames: ['customers/1234567890/conversionActions/9001']
    }), auth, { query })).resolves.toEqual({ exists: false })
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      maxRows: 1,
      query: expect.stringContaining('custom_conversion_goal.name = \'Qualified dealer leads\'')
    }))
  })

  it.each(['update_custom_conversion_goal', 'archive_custom_conversion_goal'] as const)(
    'loads a tenant-bound custom conversion goal before %s',
    async (operation) => {
      const resourceName = 'customers/1234567890/customConversionGoals/9101'
      const conversionAction = 'customers/1234567890/conversionActions/9001'
      const query = vi.fn().mockResolvedValue({
        rows: [{ customConversionGoal: {
          resourceName,
          name: 'Qualified dealer leads',
          status: 'ENABLED',
          conversionActions: [conversionAction]
        } }],
        more: 0
      })
      const args = operation === 'update_custom_conversion_goal'
        ? { resourceName, name: 'Sales-qualified dealer leads' }
        : { resourceName }
      await expect(loadSearchGoogleAdsCurrentState(
        context(operation, args), auth, { query }
      )).resolves.toMatchObject({ resourceName, status: 'ENABLED' })
    }
  )

  it('loads and normalizes a tenant-bound custom audience before updating it', async () => {
    const resourceName = 'customers/1234567890/customAudiences/8001'
    const query = vi.fn().mockResolvedValue({
      rows: [{ customAudience: {
        resourceName,
        name: 'Northern GAC intent',
        description: 'People researching GAC vehicles',
        status: 'ENABLED',
        type: 'SEARCH',
        members: [
          { memberType: 'URL', url: 'https://example.com/gac' },
          { memberType: 'KEYWORD', keyword: 'GAC SUV' },
          { memberType: 'PLACE_CATEGORY', placeCategory: '1001' },
          { memberType: 'APP', app: 'au.com.example.gac' }
        ]
      } }],
      more: 0
    })

    await expect(loadSearchGoogleAdsCurrentState(context('manage_custom_audience', {
      action: 'update',
      resourceName,
      description: 'Updated intent audience'
    }), auth, { query })).resolves.toEqual({
      resourceName,
      name: 'Northern GAC intent',
      description: 'People researching GAC vehicles',
      status: 'ENABLED',
      type: 'SEARCH',
      members: [
        { type: 'APP', value: 'au.com.example.gac' },
        { type: 'KEYWORD', value: 'GAC SUV' },
        { type: 'PLACE_CATEGORY', value: '1001' },
        { type: 'URL', value: 'https://example.com/gac' }
      ]
    })
    expect(query).toHaveBeenCalledWith(expect.objectContaining({
      maxRows: 1,
      query: expect.stringContaining('custom_audience.id = 8001')
    }))
  })

  it('rejects a duplicate custom-audience name before planning creation', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ customAudience: {
        resourceName: 'customers/1234567890/customAudiences/8001'
      } }],
      more: 0
    })
    await expect(loadSearchGoogleAdsCurrentState(context('manage_custom_audience', {
      action: 'create',
      name: 'Northern GAC intent',
      type: 'AUTO',
      members: [{ type: 'KEYWORD', value: 'GAC' }]
    }), auth, { query })).rejects.toThrow('already exists')
    expect(query.mock.calls[0]?.[0].query).toContain(
      'custom_audience.name = \'Northern GAC intent\''
    )
  })

  it('fails closed when a custom-audience name lookup returns an untrusted row shape', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ customAudience: { resourceName: 8001 } }],
      more: 0
    })
    await expect(loadSearchGoogleAdsCurrentState(context('manage_custom_audience', {
      action: 'create',
      name: 'Northern GAC intent',
      type: 'AUTO',
      members: [{ type: 'KEYWORD', value: 'GAC' }]
    }), auth, { query })).rejects.toThrow('already exists')
  })

  it('loads only the requested Performance Max audience-signal set', async () => {
    const assetGroup = 'customers/1234567890/assetGroups/7001'
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          assetGroup: { resourceName: assetGroup, campaign: 'customers/1234567890/campaigns/6001' },
          campaign: { advertisingChannelType: 'PERFORMANCE_MAX' }
        }],
        more: 0
      })
      .mockResolvedValueOnce({
        rows: [
          { assetGroupSignal: {
            resourceName: 'customers/1234567890/assetGroupSignals/7001~8101',
            assetGroup,
            audience: { audience: 'customers/1234567890/audiences/9001' }
          } },
          { assetGroupSignal: {
            resourceName: 'customers/1234567890/assetGroupSignals/7001~8201',
            assetGroup,
            searchTheme: { text: 'GAC SUV' },
            approvalStatus: 'APPROVED',
            disapprovalReasons: []
          } },
          { assetGroupSignal: {
            resourceName: 'customers/1234567890/assetGroupSignals/7001~8301',
            assetGroup
          } }
        ],
        more: 0
      })

    await expect(loadSearchGoogleAdsCurrentState(context('set_pmax_signals', {
      assetGroupResourceName: assetGroup,
      audienceResourceNames: []
    }), auth, { query })).resolves.toEqual({
      assetGroupResourceName: assetGroup,
      audienceSignals: [{
        resourceName: 'customers/1234567890/assetGroupSignals/7001~8101',
        audienceResourceName: 'customers/1234567890/audiences/9001'
      }]
    })
    expect(query.mock.calls[0]?.[0].query).toContain('asset_group.id = 7001')
    expect(query.mock.calls[1]?.[0]).toMatchObject({ maxRows: 10_000 })
  })

  it('loads search-theme review details and rejects non-Performance-Max asset groups', async () => {
    const assetGroup = 'customers/1234567890/assetGroups/7001'
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          assetGroup: { resourceName: assetGroup, campaign: 'customers/1234567890/campaigns/6001' },
          campaign: { advertisingChannelType: 'PERFORMANCE_MAX' }
        }],
        more: 0
      })
      .mockResolvedValueOnce({
        rows: [{ assetGroupSignal: {
          resourceName: 'customers/1234567890/assetGroupSignals/7001~8201',
          assetGroup,
          searchTheme: { text: 'GAC SUV' },
          approvalStatus: 'LIMITED',
          disapprovalReasons: ['Low search volume']
        } }],
        more: 0
      })

    await expect(loadSearchGoogleAdsCurrentState(context('set_search_themes', {
      assetGroupResourceName: assetGroup,
      themes: []
    }), auth, { query })).resolves.toEqual({
      assetGroupResourceName: assetGroup,
      searchThemes: [{
        resourceName: 'customers/1234567890/assetGroupSignals/7001~8201',
        text: 'GAC SUV',
        approvalStatus: 'LIMITED',
        disapprovalReasons: ['Low search volume']
      }]
    })

    await expect(loadSearchGoogleAdsCurrentState(context('set_search_themes', {
      assetGroupResourceName: assetGroup,
      themes: []
    }), auth, {
      query: vi.fn().mockResolvedValue({
        rows: [{
          assetGroup: { resourceName: assetGroup, campaign: 'customers/1234567890/campaigns/6001' },
          campaign: { advertisingChannelType: 'SEARCH' }
        }],
        more: 0
      })
    })).rejects.toThrow('Performance Max')
  })
})

describe('Search Google Ads readback verification', () => {
  it('compares normalized keyword sets without depending on provider row order', () => {
    expect(verifySearchGoogleAdsState(
      { criteria: [
        { text: 'jobs', matchType: 'PHRASE', negative: true },
        { text: 'Free', matchType: 'EXACT', negative: true }
      ] },
      { criteria: [
        { text: 'Free', matchType: 'EXACT', negative: true },
        { text: 'jobs', matchType: 'PHRASE', negative: true }
      ] }
    )).toEqual({ ok: true, diffs: [] })
  })

  it('returns field-level evidence when a status does not read back', () => {
    expect(verifySearchGoogleAdsState(
      { resourceName: 'customers/1234567890/campaigns/10', status: 'PAUSED' },
      { resourceName: 'customers/1234567890/campaigns/10', status: 'ENABLED' }
    )).toEqual({
      ok: false,
      diffs: [{ field: 'status', expected: 'PAUSED', actual: 'ENABLED' }]
    })
  })

  it('ignores provider-assigned identifiers while verifying expected create fields', () => {
    expect(verifySearchGoogleAdsState(
      { name: 'Northern Search Budget', amountMicros: '40000000' },
      {
        resourceName: 'customers/1234567890/campaignBudgets/50',
        name: 'Northern Search Budget',
        amountMicros: '40000000'
      }
    )).toEqual({ ok: true, diffs: [] })
  })
})

describe('Search Google Ads persisted-plan state loading', () => {
  it('reconstructs a negative-keyword read only from immutable plan fields', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], more: 0 })
    const plan = {
      operation: 'add_negative_keywords',
      resourceType: 'negative_keyword',
      resourceName: 'customers/1234567890/campaigns/10',
      customerId: '1234567890',
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      actorId: '33333333-3333-4333-8333-333333333333',
      source: 'mcp',
      requestedMode: 'proposal',
      idempotencyKey: 'negative-1',
      providerOperations: [{ service: 'campaignCriteria' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query })).resolves.toEqual({ criteria: [] })
    expect(query.mock.calls[0]?.[0].query).toContain('FROM campaign_criterion')
  })

  it('uses the provider mutation resource name to read back a created budget', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ campaignBudget: {
        resourceName: 'customers/1234567890/campaignBudgets/50',
        name: 'Northern Search Budget',
        amountMicros: '40000000',
        deliveryMethod: 'STANDARD',
        explicitlyShared: false
      } }],
      more: 0
    })
    const plan = {
      operation: 'create_budget',
      resourceType: 'budget',
      resourceName: null,
      customerId: '1234567890',
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      actorId: '33333333-3333-4333-8333-333333333333',
      source: 'mcp',
      executionMode: 'proposal',
      idempotencyKey: 'budget-1',
      desiredState: {
        name: 'Northern Search Budget',
        amountMicros: '40000000',
        deliveryMethod: 'STANDARD',
        explicitlyShared: false
      },
      providerOperations: [{ service: 'campaignBudgets' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query }, {
      results: [{ resourceName: 'customers/1234567890/campaignBudgets/50' }]
    })).resolves.toMatchObject({
      resourceName: 'customers/1234567890/campaignBudgets/50',
      amountMicros: '40000000'
    })
    expect(query.mock.calls[0]?.[0].query).toContain('campaign_budget.id = 50')
  })

  it('uses a nested provider mutation result to read back a created Search campaign', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ campaign: {
        resourceName: 'customers/1234567890/campaigns/60',
        name: 'Northern Search',
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
      } }],
      more: 0
    })
    const plan = {
      operation: 'create_campaign',
      resourceType: 'campaign',
      resourceName: null,
      customerId: '1234567890',
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      actorId: '33333333-3333-4333-8333-333333333333',
      source: 'mcp',
      executionMode: 'proposal',
      idempotencyKey: 'campaign-1',
      desiredState: {
        name: 'Northern Search',
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
      },
      providerOperations: [{ service: 'campaigns' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query }, {
      results: [{ campaign: { resourceName: 'customers/1234567890/campaigns/60' } }]
    })).resolves.toMatchObject({
      resourceName: 'customers/1234567890/campaigns/60',
      campaignBudget: 'customers/1234567890/campaignBudgets/50',
      status: 'PAUSED'
    })
    expect(query.mock.calls[0]?.[0].query).toContain('campaign.id = 60')
  })

  it('reads back a created ad group with its forced paused status and bid', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ adGroup: {
        resourceName: 'customers/1234567890/adGroups/70',
        name: 'New Vehicles',
        campaign: 'customers/1234567890/campaigns/60',
        type: 'SEARCH_STANDARD',
        status: 'PAUSED',
        cpcBidMicros: '3500000'
      } }],
      more: 0
    })
    const plan = {
      operation: 'create_ad_group',
      resourceType: 'ad_group',
      resourceName: null,
      customerId: '1234567890',
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      actorId: '33333333-3333-4333-8333-333333333333',
      source: 'mcp',
      executionMode: 'proposal',
      idempotencyKey: 'ad-group-1',
      desiredState: {
        name: 'New Vehicles',
        campaign: 'customers/1234567890/campaigns/60',
        type: 'SEARCH_STANDARD',
        status: 'PAUSED',
        cpcBidMicros: '3500000'
      },
      providerOperations: [{ service: 'adGroups' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query }, {
      results: [{ resourceName: 'customers/1234567890/adGroups/70' }]
    })).resolves.toMatchObject({
      resourceName: 'customers/1234567890/adGroups/70',
      campaign: 'customers/1234567890/campaigns/60',
      status: 'PAUSED',
      cpcBidMicros: '3500000'
    })
    expect(query.mock.calls[0]?.[0].query).toContain('ad_group.id = 70')
  })

  it('reads back all governed fields of a created responsive search ad', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ adGroupAd: {
        resourceName: 'customers/1234567890/adGroupAds/70~80',
        adGroup: 'customers/1234567890/adGroups/70',
        status: 'PAUSED',
        ad: {
          finalUrls: ['https://northerngac.com.au/vehicles'],
          responsiveSearchAd: {
            headlines: [
              { text: 'Northern GAC' },
              { text: 'Explore New Vehicles' },
              { text: 'Book a Test Drive' }
            ],
            descriptions: [
              { text: 'Discover the latest GAC range.' },
              { text: 'Enquire with Northern GAC today.' }
            ],
            path1: 'vehicles',
            path2: 'new'
          }
        }
      } }],
      more: 0
    })
    const plan = {
      operation: 'create_ad',
      resourceType: 'ad',
      resourceName: 'customers/1234567890/adGroups/70',
      customerId: '1234567890',
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      actorId: '33333333-3333-4333-8333-333333333333',
      source: 'mcp',
      executionMode: 'proposal',
      idempotencyKey: 'rsa-1',
      desiredState: {
        adGroup: 'customers/1234567890/adGroups/70',
        status: 'PAUSED',
        ad: {
          finalUrls: ['https://northerngac.com.au/vehicles'],
          responsiveSearchAd: {
            headlines: [
              { text: 'Northern GAC' },
              { text: 'Explore New Vehicles' },
              { text: 'Book a Test Drive' }
            ],
            descriptions: [
              { text: 'Discover the latest GAC range.' },
              { text: 'Enquire with Northern GAC today.' }
            ],
            path1: 'vehicles',
            path2: 'new'
          }
        }
      },
      providerOperations: [{ service: 'adGroupAds' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query }, {
      results: [{ adGroupAd: { resourceName: 'customers/1234567890/adGroupAds/70~80' } }]
    })).resolves.toMatchObject({
      resourceName: 'customers/1234567890/adGroupAds/70~80',
      adGroup: 'customers/1234567890/adGroups/70',
      status: 'PAUSED'
    })
    expect(query.mock.calls[0]?.[0].query).toContain('ad_group.id = 70')
    expect(query.mock.calls[0]?.[0].query).toContain('ad_group_ad.ad.id = 80')
  })

  it('re-queries the complete positive keyword set after mutation', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{ adGroup: { resourceName: 'customers/1234567890/adGroups/70' } }],
        more: 0
      })
      .mockResolvedValueOnce({
        rows: [{ adGroupCriterion: {
          negative: false,
          status: 'PAUSED',
          keyword: { text: 'new vehicles', matchType: 'PHRASE' }
        } }],
        more: 0
      })
    const plan = {
      operation: 'add_keywords',
      resourceType: 'keyword',
      resourceName: 'customers/1234567890/adGroups/70',
      customerId: '1234567890',
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      actorId: '33333333-3333-4333-8333-333333333333',
      source: 'mcp',
      executionMode: 'proposal',
      idempotencyKey: 'keywords-1',
      desiredState: {
        adGroupResourceName: 'customers/1234567890/adGroups/70',
        criteria: [
          { text: 'new vehicles', matchType: 'PHRASE', negative: false, status: 'PAUSED' }
        ]
      },
      providerOperations: [{ service: 'adGroupCriteria' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query }, {
      results: [{ resourceName: 'customers/1234567890/adGroupCriteria/70~90' }]
    })).resolves.toEqual(plan.desiredState)
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('re-reads an updated budget from its immutable plan resource', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ campaignBudget: {
        resourceName: 'customers/1234567890/campaignBudgets/50',
        name: 'Northern Search Budget',
        amountMicros: '55000000',
        deliveryMethod: 'STANDARD',
        explicitlyShared: false
      } }],
      more: 0
    })
    const plan = {
      operation: 'update_budget',
      resourceType: 'budget',
      resourceName: 'customers/1234567890/campaignBudgets/50',
      customerId: '1234567890',
      clientId: '11111111-1111-4111-8111-111111111111',
      connectionId: '22222222-2222-4222-8222-222222222222',
      actorId: '33333333-3333-4333-8333-333333333333',
      source: 'mcp',
      executionMode: 'proposal',
      idempotencyKey: 'budget-update-1',
      desiredState: {
        resourceName: 'customers/1234567890/campaignBudgets/50',
        name: 'Northern Search Budget',
        amountMicros: '55000000',
        deliveryMethod: 'STANDARD',
        explicitlyShared: false
      },
      providerOperations: [{ service: 'campaignBudgets' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query })).resolves.toEqual(plan.desiredState)
  })

  it('re-reads campaign location match mode from immutable desired state', async () => {
    const campaignResourceName = 'customers/1234567890/campaigns/60'
    const query = vi.fn().mockResolvedValue({
      rows: [{ campaign: {
        resourceName: campaignResourceName,
        geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' }
      } }],
      more: 0
    })
    const plan = {
      operation: 'set_location_match_mode',
      resourceType: 'location',
      resourceName: campaignResourceName,
      customerId: '1234567890',
      desiredState: { campaignResourceName, positiveGeoTargetType: 'PRESENCE' },
      providerOperations: [{ service: 'campaigns' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query })).resolves.toEqual(plan.desiredState)
  })

  it('uses the provider result to read back a created conversion action', async () => {
    const resourceName = 'customers/1234567890/conversionActions/9001'
    const query = vi.fn().mockResolvedValue({
      rows: [{ conversionAction: {
        resourceName,
        name: 'Finance enquiry',
        status: 'ENABLED',
        type: 'WEBPAGE',
        category: 'SUBMIT_LEAD_FORM',
        origin: 'WEBSITE',
        primaryForGoal: true,
        includeInConversionsMetric: true,
        countingType: 'ONE_PER_CLICK',
        clickThroughLookbackWindowDays: '30',
        viewThroughLookbackWindowDays: '1'
      } }],
      more: 0
    })
    const plan = {
      operation: 'create_conversion_action',
      resourceType: 'conversion_action',
      resourceName: null,
      customerId: '1234567890',
      desiredState: {
        name: 'Finance enquiry',
        status: 'ENABLED',
        type: 'WEBPAGE',
        category: 'SUBMIT_LEAD_FORM',
        countingType: 'ONE_PER_CLICK',
        clickThroughLookbackWindowDays: '30',
        viewThroughLookbackWindowDays: '1'
      },
      providerOperations: [{ service: 'conversionActions' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query }, {
      results: [{ conversionAction: { resourceName } }]
    })).resolves.toMatchObject({ resourceName, name: 'Finance enquiry', primaryForGoal: true })
    expect(query.mock.calls[0]?.[0].query).toContain('conversion_action.id = 9001')
  })

  it('uses the provider result to read back a created custom conversion goal', async () => {
    const resourceName = 'customers/1234567890/customConversionGoals/9101'
    const conversionAction = 'customers/1234567890/conversionActions/9001'
    const query = vi.fn().mockResolvedValue({
      rows: [{ customConversionGoal: {
        resourceName,
        name: 'Qualified dealer leads',
        status: 'ENABLED',
        conversionActions: [conversionAction]
      } }],
      more: 0
    })
    const plan = {
      operation: 'create_custom_conversion_goal',
      resourceType: 'custom_conversion_goal',
      resourceName: null,
      customerId: '1234567890',
      desiredState: {
        name: 'Qualified dealer leads', status: 'ENABLED', conversionActions: [conversionAction]
      },
      providerOperations: [{ service: 'customConversionGoals' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query }, {
      results: [{ customConversionGoal: { resourceName } }]
    })).resolves.toEqual({
      resourceName,
      name: 'Qualified dealer leads',
      status: 'ENABLED',
      conversionActions: [conversionAction]
    })
  })

  it('uses a nested provider result to read back a created custom audience', async () => {
    const resourceName = 'customers/1234567890/customAudiences/8001'
    const query = vi.fn().mockResolvedValue({
      rows: [{ customAudience: {
        resourceName,
        name: 'Northern GAC intent',
        description: '',
        status: 'ENABLED',
        type: 'AUTO',
        members: [{ memberType: 'KEYWORD', keyword: 'GAC' }]
      } }],
      more: 0
    })
    const plan = {
      operation: 'manage_custom_audience',
      resourceType: 'custom_audience',
      resourceName: null,
      customerId: '1234567890',
      desiredState: {
        name: 'Northern GAC intent',
        description: '',
        status: 'ENABLED',
        type: 'AUTO',
        members: [{ type: 'KEYWORD', value: 'GAC' }]
      },
      providerOperations: [{ service: 'customAudiences' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query }, {
      results: [{ customAudience: { resourceName } }]
    })).resolves.toEqual({
      resourceName,
      name: 'Northern GAC intent',
      description: '',
      status: 'ENABLED',
      type: 'AUTO',
      members: [{ type: 'KEYWORD', value: 'GAC' }]
    })
  })

  it('reads back REMOVED status after custom-audience archive', async () => {
    const resourceName = 'customers/1234567890/customAudiences/8001'
    const query = vi.fn().mockResolvedValue({
      rows: [{ customAudience: {
        resourceName,
        name: 'Northern GAC intent',
        description: '',
        status: 'REMOVED',
        type: 'AUTO',
        members: [{ memberType: 'KEYWORD', keyword: 'GAC' }]
      } }],
      more: 0
    })
    const plan = {
      operation: 'archive_custom_audience',
      resourceType: 'custom_audience',
      resourceName,
      customerId: '1234567890',
      desiredState: { resourceName, status: 'REMOVED' },
      providerOperations: [{ service: 'customAudiences' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query })).resolves.toMatchObject({
      resourceName, status: 'REMOVED'
    })
  })

  it('re-reads an exact Performance Max search-theme set after mutation', async () => {
    const assetGroupResourceName = 'customers/1234567890/assetGroups/7001'
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          assetGroup: {
            resourceName: assetGroupResourceName,
            campaign: 'customers/1234567890/campaigns/6001'
          },
          campaign: { advertisingChannelType: 'PERFORMANCE_MAX' }
        }],
        more: 0
      })
      .mockResolvedValueOnce({
        rows: [{ assetGroupSignal: {
          resourceName: 'customers/1234567890/assetGroupSignals/7001~8202',
          assetGroup: assetGroupResourceName,
          searchTheme: { text: 'GAC SUV' },
          approvalStatus: 'UNDER_REVIEW',
          disapprovalReasons: []
        } }],
        more: 0
      })
    const plan = {
      operation: 'set_search_themes',
      resourceType: 'search_theme',
      resourceName: assetGroupResourceName,
      customerId: '1234567890',
      desiredState: {
        assetGroupResourceName,
        searchThemes: [{ text: 'GAC SUV' }]
      },
      providerOperations: [{ service: 'assetGroupSignals' }]
    } as GoogleAdsActionPlan

    await expect(loadSearchGoogleAdsPlanState(plan, auth, { query })).resolves.toMatchObject({
      assetGroupResourceName,
      searchThemes: [{ text: 'GAC SUV', approvalStatus: 'UNDER_REVIEW' }]
    })
  })
})
