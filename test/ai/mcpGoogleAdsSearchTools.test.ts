import { describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import {
  executeGoogleAdsSearchPlanningTool,
  googleAdsSearchPlanningTools,
  isGoogleAdsSearchPlanningTool
} from '~~/server/utils/ai/mcp/googleAdsSearchTools'

const context: ToolContext = {
  userId: '11111111-1111-4111-8111-111111111111',
  userRole: 'media_buyer',
  event: {} as never,
  source: 'mcp'
}

const flags = { read: true, write: true, automation: false, destructive: false }

describe('Google Ads Search MCP planning descriptors', () => {
  it('exposes only typed Search planning tools without raw provider passthrough', () => {
    expect(googleAdsSearchPlanningTools.map(tool => tool.name)).toEqual([
      'google_ads_plan_pause',
      'google_ads_plan_archive',
      'google_ads_plan_remove',
      'google_ads_plan_enable',
      'google_ads_plan_add_negative_keywords',
      'google_ads_plan_create_budget',
      'google_ads_plan_update_budget',
      'google_ads_plan_create_search_campaign',
      'google_ads_plan_update_campaign',
      'google_ads_plan_create_ad_group',
      'google_ads_plan_update_ad_group',
      'google_ads_plan_create_responsive_search_ad',
      'google_ads_plan_add_keywords',
      'google_ads_plan_update_keyword',
      'google_ads_plan_set_locations',
      'google_ads_plan_set_location_match_mode',
      'google_ads_plan_set_languages',
      'google_ads_plan_set_ad_schedule',
      'google_ads_plan_set_devices',
      'google_ads_plan_set_demographics',
      'google_ads_plan_set_placements',
      'google_ads_plan_set_content_exclusions',
      'google_ads_plan_set_audience_associations',
      'google_ads_plan_set_campaign_conversion_goals',
      'google_ads_plan_set_campaign_goal_config',
      'google_ads_plan_set_customer_goal_biddability',
      'google_ads_plan_set_conversion_primary_state',
      'google_ads_plan_create_conversion_action',
      'google_ads_plan_update_conversion_action',
      'google_ads_plan_archive_conversion_action',
      'google_ads_plan_remove_conversion_action',
      'google_ads_plan_create_custom_conversion_goal',
      'google_ads_plan_update_custom_conversion_goal',
      'google_ads_plan_archive_custom_conversion_goal',
      'google_ads_plan_create_asset',
      'google_ads_plan_attach_asset',
      'google_ads_plan_archive_asset_link',
      'google_ads_plan_detach_asset',
      'google_ads_plan_create_asset_group',
      'google_ads_plan_update_asset_group',
      'google_ads_plan_set_asset_group_assets',
      'google_ads_plan_set_listing_groups',
      'google_ads_plan_apply_recommendation',
      'google_ads_plan_dismiss_recommendation',
      'google_ads_plan_create_custom_audience',
      'google_ads_plan_update_custom_audience',
      'google_ads_plan_archive_custom_audience',
      'google_ads_plan_set_pmax_audience_signals',
      'google_ads_plan_set_pmax_search_themes'
    ])
    const serialized = JSON.stringify(googleAdsSearchPlanningTools)
    expect(serialized).not.toMatch(/"(?:query|operations|url|accessToken|developerToken)"/)
    expect(isGoogleAdsSearchPlanningTool('google_ads_mutate')).toBe(false)
  })

  it('maps a pause request into an immutable campaign action plan', async () => {
    const plan = vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      operation: 'pause_campaign',
      resourceType: 'campaign',
      resourceName: 'customers/1234567890/campaigns/10',
      riskTier: 'confirm',
      executionMode: 'proposal',
      policyDecision: { allowed: true },
      status: 'pending_approval',
      diff: [{ field: 'status', before: 'ENABLED', after: 'PAUSED' }]
    })

    await expect(executeGoogleAdsSearchPlanningTool(
      'google_ads_plan_pause',
      {
        clientId: '33333333-3333-4333-8333-333333333333',
        connectionId: '44444444-4444-4444-8444-444444444444',
        entityType: 'campaign',
        resourceName: 'customers/1234567890/campaigns/10',
        requestedMode: 'proposal',
        idempotencyKey: 'pause-10'
      },
      context,
      flags,
      true,
      { plan }
    )).resolves.toMatchObject({
      ok: true,
      data: {
        actionPlanId: '22222222-2222-4222-8222-222222222222',
        operation: 'pause_campaign',
        status: 'pending_approval'
      }
    })
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({
      actorId: context.userId,
      source: 'mcp',
      operation: 'pause_campaign',
      resourceType: 'campaign',
      arguments: { resourceName: 'customers/1234567890/campaigns/10' }
    }), expect.objectContaining({ actorRole: 'media_buyer', hasWriteScope: true }), flags)
  })

  it('maps archive to pause semantics rather than provider removal', async () => {
    const plan = vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      operation: 'archive_ad',
      resourceType: 'ad',
      resourceName: 'customers/1234567890/adGroupAds/20~30',
      riskTier: 'confirm',
      executionMode: 'proposal',
      policyDecision: { allowed: true },
      status: 'pending_approval',
      diff: []
    })
    await executeGoogleAdsSearchPlanningTool('google_ads_plan_archive', {
      clientId: '33333333-3333-4333-8333-333333333333',
      connectionId: '44444444-4444-4444-8444-444444444444',
      entityType: 'ad',
      resourceName: 'customers/1234567890/adGroupAds/20~30',
      idempotencyKey: 'archive-ad-30'
    }, context, flags, true, { plan })

    expect(plan.mock.calls[0]?.[0].operation).toBe('archive_ad')
    expect(plan.mock.calls[0]?.[0].operation).not.toBe('remove_ad')
  })

  it('maps permanent removal with its operator reason into a destructive plan', async () => {
    const reason = 'Duplicate campaign confirmed during campaign QA.'
    const plan = vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      operation: 'remove_campaign',
      resourceType: 'campaign',
      resourceName: 'customers/1234567890/campaigns/10',
      riskTier: 'destructive_confirm',
      executionMode: 'proposal',
      policyDecision: { allowed: true },
      status: 'pending_approval',
      diff: []
    })

    await expect(executeGoogleAdsSearchPlanningTool('google_ads_plan_remove', {
      clientId: '33333333-3333-4333-8333-333333333333',
      connectionId: '44444444-4444-4444-8444-444444444444',
      entityType: 'campaign',
      resourceName: 'customers/1234567890/campaigns/10',
      reason,
      idempotencyKey: 'remove-campaign-10'
    }, context, { ...flags, destructive: true }, true, { plan })).resolves.toMatchObject({ ok: true })

    expect(plan).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'remove_campaign',
      resourceType: 'campaign',
      arguments: {
        resourceName: 'customers/1234567890/campaigns/10',
        reason
      }
    }), expect.any(Object), { ...flags, destructive: true })
  })

  it.each([
    {
      tool: 'google_ads_plan_update_campaign',
      operation: 'update_campaign',
      resourceType: 'campaign',
      args: {
        resourceName: 'customers/1234567890/campaigns/10',
        name: 'Northern GAC Search',
        includeSearchPartners: false
      }
    },
    {
      tool: 'google_ads_plan_update_ad_group',
      operation: 'update_ad_group',
      resourceType: 'ad_group',
      args: { resourceName: 'customers/1234567890/adGroups/20', cpcBid: 2.5 }
    },
    {
      tool: 'google_ads_plan_update_keyword',
      operation: 'update_keyword',
      resourceType: 'keyword',
      args: {
        resourceName: 'customers/1234567890/adGroupCriteria/20~40',
        finalUrl: 'https://example.com/gac'
      }
    }
  ])('maps $tool into a typed rich-confirm update plan', async ({
    tool, operation, resourceType, args
  }) => {
    const plan = vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      operation,
      resourceType,
      resourceName: args.resourceName,
      riskTier: 'rich_confirm',
      executionMode: 'proposal',
      policyDecision: { allowed: true },
      status: 'pending_approval',
      diff: []
    })
    await expect(executeGoogleAdsSearchPlanningTool(tool, {
      clientId: '33333333-3333-4333-8333-333333333333',
      connectionId: '44444444-4444-4444-8444-444444444444',
      idempotencyKey: `${operation}-1`,
      ...args
    }, context, flags, true, { plan })).resolves.toMatchObject({ ok: true })
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({
      operation,
      resourceType,
      arguments: args
    }), expect.any(Object), flags)
  })

  it.each([
    {
      tool: 'google_ads_plan_create_budget',
      args: { name: 'Northern Search Budget', dailyAmount: 40 },
      operation: 'create_budget',
      resourceType: 'budget',
      expectedArguments: { name: 'Northern Search Budget', dailyAmount: 40 }
    },
    {
      tool: 'google_ads_plan_update_budget',
      args: {
        resourceName: 'customers/1234567890/campaignBudgets/50',
        dailyAmount: 55
      },
      operation: 'update_budget',
      resourceType: 'budget',
      expectedArguments: {
        resourceName: 'customers/1234567890/campaignBudgets/50',
        dailyAmount: 55
      }
    },
    {
      tool: 'google_ads_plan_create_search_campaign',
      args: {
        name: 'Northern Search',
        budgetResourceName: 'customers/1234567890/campaignBudgets/50',
        includeSearchPartners: false
      },
      operation: 'create_campaign',
      resourceType: 'campaign',
      expectedArguments: {
        name: 'Northern Search',
        budgetResourceName: 'customers/1234567890/campaignBudgets/50',
        includeSearchPartners: false
      }
    },
    {
      tool: 'google_ads_plan_create_ad_group',
      args: {
        name: 'New Vehicles',
        campaignResourceName: 'customers/1234567890/campaigns/60',
        cpcBid: 3.5
      },
      operation: 'create_ad_group',
      resourceType: 'ad_group',
      expectedArguments: {
        name: 'New Vehicles',
        campaignResourceName: 'customers/1234567890/campaigns/60',
        cpcBid: 3.5
      }
    },
    {
      tool: 'google_ads_plan_create_responsive_search_ad',
      args: {
        adGroupResourceName: 'customers/1234567890/adGroups/70',
        finalUrl: 'https://northerngac.com.au/vehicles',
        headlines: ['Northern GAC', 'Explore New Vehicles', 'Book a Test Drive'],
        descriptions: ['Discover the latest GAC range.', 'Enquire with Northern GAC today.'],
        path1: 'vehicles',
        path2: 'new'
      },
      operation: 'create_ad',
      resourceType: 'ad',
      expectedArguments: {
        adGroupResourceName: 'customers/1234567890/adGroups/70',
        finalUrl: 'https://northerngac.com.au/vehicles',
        headlines: ['Northern GAC', 'Explore New Vehicles', 'Book a Test Drive'],
        descriptions: ['Discover the latest GAC range.', 'Enquire with Northern GAC today.'],
        path1: 'vehicles',
        path2: 'new'
      }
    },
    {
      tool: 'google_ads_plan_add_keywords',
      args: {
        adGroupResourceName: 'customers/1234567890/adGroups/70',
        keywords: [{ text: 'new vehicles', matchType: 'PHRASE' }]
      },
      operation: 'add_keywords',
      resourceType: 'keyword',
      expectedArguments: {
        adGroupResourceName: 'customers/1234567890/adGroups/70',
        keywords: [{ text: 'new vehicles', matchType: 'PHRASE' }]
      }
    },
    {
      tool: 'google_ads_plan_set_locations',
      args: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        geoTargetConstantIds: ['1014044', '1014045']
      },
      operation: 'set_locations',
      resourceType: 'location',
      expectedArguments: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        geoTargetConstantIds: ['1014044', '1014045']
      }
    },
    {
      tool: 'google_ads_plan_set_location_match_mode',
      args: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        positiveGeoTargetType: 'PRESENCE'
      },
      operation: 'set_location_match_mode',
      resourceType: 'location',
      expectedArguments: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        positiveGeoTargetType: 'PRESENCE'
      }
    },
    {
      tool: 'google_ads_plan_set_languages',
      args: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        languageConstantIds: ['1000', '1001']
      },
      operation: 'set_languages',
      resourceType: 'language',
      expectedArguments: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        languageConstantIds: ['1000', '1001']
      }
    },
    {
      tool: 'google_ads_plan_set_ad_schedule',
      args: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        schedules: [{
          dayOfWeek: 'MONDAY', startHour: 9, startMinute: 0, endHour: 17, endMinute: 0
        }]
      },
      operation: 'set_ad_schedule',
      resourceType: 'ad_schedule',
      expectedArguments: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        schedules: [{
          dayOfWeek: 'MONDAY', startHour: 9, startMinute: 0, endHour: 17, endMinute: 0
        }]
      }
    },
    {
      tool: 'google_ads_plan_set_devices',
      args: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        devices: [
          { type: 'MOBILE', bidModifier: 0 },
          { type: 'DESKTOP', bidModifier: 1.2 }
        ]
      },
      operation: 'set_devices',
      resourceType: 'device',
      expectedArguments: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        devices: [
          { type: 'MOBILE', bidModifier: 0 },
          { type: 'DESKTOP', bidModifier: 1.2 }
        ]
      }
    },
    {
      tool: 'google_ads_plan_set_demographics',
      args: {
        adGroupResourceName: 'customers/1234567890/adGroups/20',
        criteria: [
          { dimension: 'GENDER', type: 'MALE', excluded: false },
          { dimension: 'AGE_RANGE', type: 'AGE_RANGE_18_24', excluded: true }
        ]
      },
      operation: 'set_demographics',
      resourceType: 'demographic',
      expectedArguments: {
        adGroupResourceName: 'customers/1234567890/adGroups/20',
        criteria: [
          { dimension: 'GENDER', type: 'MALE', excluded: false },
          { dimension: 'AGE_RANGE', type: 'AGE_RANGE_18_24', excluded: true }
        ]
      }
    },
    {
      tool: 'google_ads_plan_set_placements',
      args: {
        scope: 'campaign',
        parentResourceName: 'customers/1234567890/campaigns/60',
        urls: ['https://example.com/excluded']
      },
      operation: 'set_placements',
      resourceType: 'placement',
      expectedArguments: {
        scope: 'campaign',
        parentResourceName: 'customers/1234567890/campaigns/60',
        urls: ['https://example.com/excluded']
      }
    },
    {
      tool: 'google_ads_plan_set_content_exclusions',
      args: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        labels: ['PROFANITY', 'TRAGEDY']
      },
      operation: 'set_content_exclusions',
      resourceType: 'content_exclusion',
      expectedArguments: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        labels: ['PROFANITY', 'TRAGEDY']
      }
    },
    {
      tool: 'google_ads_plan_set_audience_associations',
      args: {
        adGroupResourceName: 'customers/1234567890/adGroups/20',
        audienceResourceNames: ['customers/1234567890/audiences/701'],
        mode: 'OBSERVATION'
      },
      operation: 'set_audience_associations',
      resourceType: 'audience',
      expectedArguments: {
        adGroupResourceName: 'customers/1234567890/adGroups/20',
        audienceResourceNames: ['customers/1234567890/audiences/701'],
        mode: 'OBSERVATION'
      }
    },
    {
      tool: 'google_ads_plan_set_campaign_conversion_goals',
      args: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        goals: [
          { category: 'REQUEST_QUOTE', origin: 'WEBSITE', biddable: true },
          { category: 'SUBMIT_LEAD_FORM', origin: 'WEBSITE', biddable: false }
        ]
      },
      operation: 'set_campaign_conversion_goals',
      resourceType: 'conversion_goal',
      expectedArguments: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        goals: [
          { category: 'REQUEST_QUOTE', origin: 'WEBSITE', biddable: true },
          { category: 'SUBMIT_LEAD_FORM', origin: 'WEBSITE', biddable: false }
        ]
      }
    },
    {
      tool: 'google_ads_plan_set_campaign_goal_config',
      args: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        mode: 'CUSTOM_GOAL',
        customConversionGoalResourceName: 'customers/1234567890/customConversionGoals/9101'
      },
      operation: 'set_conversion_goal',
      resourceType: 'conversion_goal',
      expectedArguments: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        mode: 'CUSTOM_GOAL',
        customConversionGoalResourceName: 'customers/1234567890/customConversionGoals/9101'
      }
    },
    {
      tool: 'google_ads_plan_set_customer_goal_biddability',
      args: {
        category: 'REQUEST_QUOTE',
        origin: 'WEBSITE',
        biddable: false
      },
      operation: 'set_customer_goal_biddability',
      resourceType: 'conversion_goal',
      expectedArguments: {
        category: 'REQUEST_QUOTE',
        origin: 'WEBSITE',
        biddable: false
      }
    },
    {
      tool: 'google_ads_plan_set_conversion_primary_state',
      args: {
        resourceName: 'customers/1234567890/conversionActions/9001',
        primaryForGoal: false
      },
      operation: 'set_conversion_primary_state',
      resourceType: 'conversion_action',
      expectedArguments: {
        resourceName: 'customers/1234567890/conversionActions/9001',
        primaryForGoal: false
      }
    },
    {
      tool: 'google_ads_plan_create_conversion_action',
      args: {
        name: 'Finance enquiry',
        type: 'WEBPAGE',
        category: 'SUBMIT_LEAD_FORM',
        countingType: 'ONE_PER_CLICK',
        clickThroughLookbackWindowDays: 30,
        viewThroughLookbackWindowDays: 1
      },
      operation: 'create_conversion_action',
      resourceType: 'conversion_action',
      expectedArguments: {
        name: 'Finance enquiry',
        type: 'WEBPAGE',
        category: 'SUBMIT_LEAD_FORM',
        countingType: 'ONE_PER_CLICK',
        clickThroughLookbackWindowDays: 30,
        viewThroughLookbackWindowDays: 1
      }
    },
    {
      tool: 'google_ads_plan_update_conversion_action',
      args: {
        resourceName: 'customers/1234567890/conversionActions/9001',
        name: 'Finance lead',
        category: 'QUALIFIED_LEAD',
        status: 'HIDDEN'
      },
      operation: 'update_conversion_action',
      resourceType: 'conversion_action',
      expectedArguments: {
        resourceName: 'customers/1234567890/conversionActions/9001',
        name: 'Finance lead',
        category: 'QUALIFIED_LEAD',
        status: 'HIDDEN'
      }
    },
    {
      tool: 'google_ads_plan_archive_conversion_action',
      args: { resourceName: 'customers/1234567890/conversionActions/9001' },
      operation: 'archive_conversion_action',
      resourceType: 'conversion_action',
      expectedArguments: { resourceName: 'customers/1234567890/conversionActions/9001' }
    },
    {
      tool: 'google_ads_plan_remove_conversion_action',
      args: {
        resourceName: 'customers/1234567890/conversionActions/9001',
        reason: 'Duplicate conversion action retired after measurement QA.'
      },
      operation: 'remove_conversion_action',
      resourceType: 'conversion_action',
      expectedArguments: {
        resourceName: 'customers/1234567890/conversionActions/9001',
        reason: 'Duplicate conversion action retired after measurement QA.'
      }
    },
    {
      tool: 'google_ads_plan_create_custom_conversion_goal',
      args: {
        name: 'Qualified dealer leads',
        conversionActionResourceNames: [
          'customers/1234567890/conversionActions/9001',
          'customers/1234567890/conversionActions/9002'
        ]
      },
      operation: 'create_custom_conversion_goal',
      resourceType: 'custom_conversion_goal',
      expectedArguments: {
        name: 'Qualified dealer leads',
        conversionActionResourceNames: [
          'customers/1234567890/conversionActions/9001',
          'customers/1234567890/conversionActions/9002'
        ]
      }
    },
    {
      tool: 'google_ads_plan_update_custom_conversion_goal',
      args: {
        resourceName: 'customers/1234567890/customConversionGoals/9101',
        name: 'Sales-qualified dealer leads',
        conversionActionResourceNames: ['customers/1234567890/conversionActions/9002']
      },
      operation: 'update_custom_conversion_goal',
      resourceType: 'custom_conversion_goal',
      expectedArguments: {
        resourceName: 'customers/1234567890/customConversionGoals/9101',
        name: 'Sales-qualified dealer leads',
        conversionActionResourceNames: ['customers/1234567890/conversionActions/9002']
      }
    },
    {
      tool: 'google_ads_plan_archive_custom_conversion_goal',
      args: {
        resourceName: 'customers/1234567890/customConversionGoals/9101',
        reason: 'Obsolete custom goal replaced by the approved dealership lead goal.'
      },
      operation: 'archive_custom_conversion_goal',
      resourceType: 'custom_conversion_goal',
      expectedArguments: {
        resourceName: 'customers/1234567890/customConversionGoals/9101',
        reason: 'Obsolete custom goal replaced by the approved dealership lead goal.'
      }
    },
    {
      tool: 'google_ads_plan_create_asset',
      args: {
        type: 'CALL',
        name: 'Northern GAC calls',
        countryCode: 'au',
        phoneNumber: '(03) 9999 0000'
      },
      operation: 'create_asset',
      resourceType: 'asset',
      expectedArguments: {
        type: 'CALL',
        name: 'Northern GAC calls',
        countryCode: 'au',
        phoneNumber: '(03) 9999 0000'
      }
    },
    {
      tool: 'google_ads_plan_attach_asset',
      args: {
        scope: 'campaign',
        parentResourceName: 'customers/1234567890/campaigns/60',
        assetResourceName: 'customers/1234567890/assets/9201',
        fieldType: 'CALL'
      },
      operation: 'attach_asset',
      resourceType: 'asset_link',
      expectedArguments: {
        scope: 'campaign',
        parentResourceName: 'customers/1234567890/campaigns/60',
        assetResourceName: 'customers/1234567890/assets/9201',
        fieldType: 'CALL'
      }
    },
    {
      tool: 'google_ads_plan_archive_asset_link',
      args: {
        scope: 'campaign',
        resourceName: 'customers/1234567890/campaignAssets/60~9201~CALL',
        requestedMode: 'proposal'
      },
      operation: 'archive_asset_link',
      resourceType: 'asset_link',
      expectedArguments: {
        scope: 'campaign',
        resourceName: 'customers/1234567890/campaignAssets/60~9201~CALL'
      }
    },
    {
      tool: 'google_ads_plan_detach_asset',
      args: {
        scope: 'campaign',
        resourceName: 'customers/1234567890/campaignAssets/60~9201~CALL'
      },
      operation: 'detach_asset',
      resourceType: 'asset_link',
      expectedArguments: {
        scope: 'campaign',
        resourceName: 'customers/1234567890/campaignAssets/60~9201~CALL'
      }
    },
    {
      tool: 'google_ads_plan_create_asset_group',
      args: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        name: 'SUV range',
        finalUrls: ['https://example.com/suv'],
        path1: 'suv',
        assets: [
          { fieldType: 'HEADLINE', assetResourceName: 'customers/1234567890/assets/7001' }
        ]
      },
      operation: 'create_asset_group',
      resourceType: 'asset_group',
      expectedArguments: {
        campaignResourceName: 'customers/1234567890/campaigns/60',
        name: 'SUV range',
        finalUrls: ['https://example.com/suv'],
        path1: 'suv',
        assets: [
          { fieldType: 'HEADLINE', assetResourceName: 'customers/1234567890/assets/7001' }
        ]
      }
    },
    {
      tool: 'google_ads_plan_update_asset_group',
      args: {
        resourceName: 'customers/1234567890/assetGroups/7001',
        name: 'Paused SUV range',
        finalMobileUrls: [],
        path1: null,
        status: 'PAUSED'
      },
      operation: 'update_asset_group',
      resourceType: 'asset_group',
      expectedArguments: {
        resourceName: 'customers/1234567890/assetGroups/7001',
        name: 'Paused SUV range',
        finalMobileUrls: [],
        path1: null,
        status: 'PAUSED'
      }
    },
    {
      tool: 'google_ads_plan_set_asset_group_assets',
      args: {
        assetGroupResourceName: 'customers/1234567890/assetGroups/7001',
        assets: [{
          fieldType: 'HEADLINE',
          assetResourceName: 'customers/1234567890/assets/7001'
        }]
      },
      operation: 'manage_asset_group_assets',
      resourceType: 'asset_group',
      expectedArguments: {
        assetGroupResourceName: 'customers/1234567890/assetGroups/7001',
        assets: [{
          fieldType: 'HEADLINE',
          assetResourceName: 'customers/1234567890/assets/7001'
        }]
      }
    },
    {
      tool: 'google_ads_plan_set_listing_groups',
      args: {
        assetGroupResourceName: 'customers/1234567890/assetGroups/7001',
        nodes: [
          { key: 'root', type: 'SUBDIVISION' },
          {
            key: 'new', parentKey: 'root', type: 'UNIT_INCLUDED',
            dimension: { kind: 'PRODUCT_CONDITION', value: 'NEW' }
          },
          {
            key: 'other', parentKey: 'root', type: 'UNIT_EXCLUDED',
            dimension: { kind: 'PRODUCT_CONDITION', other: true }
          }
        ]
      },
      operation: 'manage_listing_groups',
      resourceType: 'listing_group',
      expectedArguments: {
        assetGroupResourceName: 'customers/1234567890/assetGroups/7001',
        nodes: [
          { key: 'root', type: 'SUBDIVISION' },
          {
            key: 'new', parentKey: 'root', type: 'UNIT_INCLUDED',
            dimension: { kind: 'PRODUCT_CONDITION', value: 'NEW' }
          },
          {
            key: 'other', parentKey: 'root', type: 'UNIT_EXCLUDED',
            dimension: { kind: 'PRODUCT_CONDITION', other: true }
          }
        ]
      }
    },
    {
      tool: 'google_ads_plan_apply_recommendation',
      args: { resourceName: 'customers/1234567890/recommendations/abc-1' },
      operation: 'apply_recommendation',
      resourceType: 'recommendation',
      expectedArguments: { resourceName: 'customers/1234567890/recommendations/abc-1' }
    },
    {
      tool: 'google_ads_plan_dismiss_recommendation',
      args: {
        resourceName: 'customers/1234567890/recommendations/abc-1',
        requestedMode: 'automatic'
      },
      operation: 'dismiss_recommendation',
      resourceType: 'recommendation',
      expectedArguments: { resourceName: 'customers/1234567890/recommendations/abc-1' },
      expectedRequestedMode: 'automatic'
    },
    {
      tool: 'google_ads_plan_create_custom_audience',
      args: {
        name: 'Northern GAC intent',
        description: 'People researching GAC vehicles',
        type: 'SEARCH',
        members: [{ type: 'KEYWORD', value: 'GAC SUV' }]
      },
      operation: 'manage_custom_audience',
      resourceType: 'custom_audience',
      expectedArguments: {
        action: 'create',
        name: 'Northern GAC intent',
        description: 'People researching GAC vehicles',
        type: 'SEARCH',
        members: [{ type: 'KEYWORD', value: 'GAC SUV' }]
      }
    },
    {
      tool: 'google_ads_plan_update_custom_audience',
      args: {
        resourceName: 'customers/1234567890/customAudiences/8001',
        description: 'Updated intent audience',
        members: [{ type: 'URL', value: 'https://example.com/gac' }]
      },
      operation: 'manage_custom_audience',
      resourceType: 'custom_audience',
      expectedArguments: {
        action: 'update',
        resourceName: 'customers/1234567890/customAudiences/8001',
        description: 'Updated intent audience',
        members: [{ type: 'URL', value: 'https://example.com/gac' }]
      }
    },
    {
      tool: 'google_ads_plan_archive_custom_audience',
      args: {
        resourceName: 'customers/1234567890/customAudiences/8001',
        reason: 'Audience is no longer approved for dealership campaign use.'
      },
      operation: 'archive_custom_audience',
      resourceType: 'custom_audience',
      expectedArguments: {
        resourceName: 'customers/1234567890/customAudiences/8001',
        reason: 'Audience is no longer approved for dealership campaign use.'
      }
    },
    {
      tool: 'google_ads_plan_set_pmax_audience_signals',
      args: {
        assetGroupResourceName: 'customers/1234567890/assetGroups/7001',
        audienceResourceNames: ['customers/1234567890/audiences/9001']
      },
      operation: 'set_pmax_signals',
      resourceType: 'audience',
      expectedArguments: {
        assetGroupResourceName: 'customers/1234567890/assetGroups/7001',
        audienceResourceNames: ['customers/1234567890/audiences/9001']
      }
    },
    {
      tool: 'google_ads_plan_set_pmax_search_themes',
      args: {
        assetGroupResourceName: 'customers/1234567890/assetGroups/7001',
        themes: ['GAC SUV', 'New vehicles']
      },
      operation: 'set_search_themes',
      resourceType: 'search_theme',
      expectedArguments: {
        assetGroupResourceName: 'customers/1234567890/assetGroups/7001',
        themes: ['GAC SUV', 'New vehicles']
      }
    }
  ])('maps $tool to a typed proposal-only plan', async ({
    tool,
    args,
    operation,
    resourceType,
    expectedArguments,
    expectedRequestedMode = 'proposal'
  }) => {
    const plan = vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      operation,
      resourceType,
      resourceName: null,
      riskTier: 'confirm',
      executionMode: 'proposal',
      policyDecision: { allowed: true },
      status: 'pending_approval',
      diff: []
    })

    await expect(executeGoogleAdsSearchPlanningTool(tool, {
      clientId: '33333333-3333-4333-8333-333333333333',
      connectionId: '44444444-4444-4444-8444-444444444444',
      idempotencyKey: `${operation}-1`,
      ...args
    }, context, flags, true, { plan })).resolves.toMatchObject({ ok: true })
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({
      operation,
      resourceType,
      requestedMode: expectedRequestedMode,
      arguments: expectedArguments
    }), expect.any(Object), flags)
  })

  it('requires write enablement before creating a plan', async () => {
    const plan = vi.fn()
    await expect(executeGoogleAdsSearchPlanningTool(
      'google_ads_plan_pause',
      {},
      context,
      { ...flags, write: false },
      true,
      { plan }
    )).resolves.toMatchObject({ ok: false, code: 'disabled' })
    expect(plan).not.toHaveBeenCalled()
  })

  it('rejects overlapping ad schedules before creating a plan', async () => {
    const plan = vi.fn()
    await expect(executeGoogleAdsSearchPlanningTool(
      'google_ads_plan_set_ad_schedule',
      {
        clientId: '33333333-3333-4333-8333-333333333333',
        connectionId: '44444444-4444-4444-8444-444444444444',
        idempotencyKey: 'overlapping-schedule',
        campaignResourceName: 'customers/1234567890/campaigns/60',
        schedules: [
          { dayOfWeek: 'MONDAY', startHour: 9, startMinute: 0, endHour: 12, endMinute: 0 },
          { dayOfWeek: 'MONDAY', startHour: 11, startMinute: 45, endHour: 13, endMinute: 0 }
        ]
      },
      context,
      flags,
      true,
      { plan }
    )).resolves.toMatchObject({ ok: false, code: 'bad_args' })
    expect(plan).not.toHaveBeenCalled()
  })

  it('rejects a conversion-action update without mutable fields before creating a plan', async () => {
    const plan = vi.fn()
    await expect(executeGoogleAdsSearchPlanningTool(
      'google_ads_plan_update_conversion_action',
      {
        clientId: '33333333-3333-4333-8333-333333333333',
        connectionId: '44444444-4444-4444-8444-444444444444',
        idempotencyKey: 'empty-conversion-update',
        resourceName: 'customers/1234567890/conversionActions/9001'
      },
      context,
      flags,
      true,
      { plan }
    )).resolves.toMatchObject({ ok: false, code: 'bad_args' })
    expect(plan).not.toHaveBeenCalled()
  })

  it('requires an operator reason for provider-removal plans', async () => {
    const plan = vi.fn()
    await expect(executeGoogleAdsSearchPlanningTool(
      'google_ads_plan_remove_conversion_action',
      {
        clientId: '33333333-3333-4333-8333-333333333333',
        connectionId: '44444444-4444-4444-8444-444444444444',
        idempotencyKey: 'remove-without-reason',
        resourceName: 'customers/1234567890/conversionActions/9001'
      },
      context,
      flags,
      true,
      { plan }
    )).resolves.toMatchObject({ ok: false, code: 'bad_args' })
    expect(plan).not.toHaveBeenCalled()

    await expect(executeGoogleAdsSearchPlanningTool(
      'google_ads_plan_remove',
      {
        clientId: '33333333-3333-4333-8333-333333333333',
        connectionId: '44444444-4444-4444-8444-444444444444',
        idempotencyKey: 'remove-campaign-without-reason',
        entityType: 'campaign',
        resourceName: 'customers/1234567890/campaigns/10'
      },
      context,
      flags,
      true,
      { plan }
    )).resolves.toMatchObject({ ok: false, code: 'bad_args' })
    expect(plan).not.toHaveBeenCalled()
  })

  it('rejects missing role or write scope before persisting a plan', async () => {
    const plan = vi.fn()
    await expect(executeGoogleAdsSearchPlanningTool(
      'google_ads_plan_pause',
      {},
      { ...context, userRole: 'viewer' },
      flags,
      true,
      { plan }
    )).resolves.toMatchObject({ ok: false, code: 'forbidden' })
    await expect(executeGoogleAdsSearchPlanningTool(
      'google_ads_plan_pause',
      {},
      context,
      flags,
      false,
      { plan }
    )).resolves.toMatchObject({ ok: false, code: 'forbidden' })
    expect(plan).not.toHaveBeenCalled()
  })
})
