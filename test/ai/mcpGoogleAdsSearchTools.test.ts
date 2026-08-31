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
      'google_ads_plan_add_negative_keywords'
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
