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
      'google_ads_plan_enable',
      'google_ads_plan_add_negative_keywords',
      'google_ads_plan_create_budget',
      'google_ads_plan_update_budget',
      'google_ads_plan_create_search_campaign',
      'google_ads_plan_create_ad_group',
      'google_ads_plan_create_responsive_search_ad',
      'google_ads_plan_add_keywords',
      'google_ads_plan_set_locations',
      'google_ads_plan_set_location_match_mode',
      'google_ads_plan_set_languages',
      'google_ads_plan_set_ad_schedule',
      'google_ads_plan_set_devices',
      'google_ads_plan_set_campaign_conversion_goals',
      'google_ads_plan_set_conversion_primary_state',
      'google_ads_plan_create_conversion_action',
      'google_ads_plan_update_conversion_action'
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
    }
  ])('maps $tool to a typed proposal-only plan', async ({
    tool,
    args,
    operation,
    resourceType,
    expectedArguments
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
      requestedMode: 'proposal',
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
