import { describe, expect, it } from 'vitest'
import {
  GoogleAdsActionPlanSchema,
  GoogleAdsOperationTypeSchema,
  GoogleAdsResourceTypeSchema
} from '~~/server/utils/googleAds/contracts'
import { resolveGoogleAdsPolicy } from '~~/server/utils/googleAds/policy'

const base = {
  actorRole: 'owner',
  hasMediaPermission: true,
  hasElevatedPermission: true,
  hasWriteScope: true,
  globalWriteEnabled: true,
  automationEnabled: true,
  destructiveEnabled: true,
  requestedMode: 'automatic' as const,
  accountPolicy: { enabled: true }
}

describe('Google Ads action contracts', () => {
  it('catalogues control-plane operations and resources as closed enums', () => {
    expect(GoogleAdsOperationTypeSchema.parse('add_negative_keywords')).toBe('add_negative_keywords')
    expect(GoogleAdsOperationTypeSchema.parse('archive_custom_audience')).toBe('archive_custom_audience')
    expect(GoogleAdsOperationTypeSchema.safeParse('raw_mutate').success).toBe(false)
    expect(GoogleAdsResourceTypeSchema.parse('conversion_goal')).toBe('conversion_goal')
    expect(GoogleAdsResourceTypeSchema.safeParse('arbitrary_http').success).toBe(false)
  })

  it('validates a tenant-bound immutable action plan', () => {
    const parsed = GoogleAdsActionPlanSchema.parse({
      id: '82c2993e-5250-4733-9220-000000000001',
      clientId: '82c2993e-5250-4733-9220-000000000002',
      connectionId: '82c2993e-5250-4733-9220-000000000003',
      customerId: '1234567890',
      actorId: '82c2993e-5250-4733-9220-000000000004',
      source: 'mcp',
      toolName: 'google_ads_add_negative_keywords',
      resourceType: 'negative_keyword',
      resourceName: null,
      operation: 'add_negative_keywords',
      currentState: { terms: [] },
      desiredState: { terms: ['free'] },
      currentStateFingerprint: 'a'.repeat(64),
      diff: [{ field: 'terms', before: [], after: ['free'] }],
      providerOperations: [{
        service: 'adGroupCriteria',
        atomicity: 'independent',
        partialFailure: true,
        operations: [{ create: { negative: true, keyword: { text: 'free', matchType: 'EXACT' } } }]
      }],
      riskTier: 'automatic',
      executionMode: 'automatic',
      policyVersion: 'policy-v1',
      policyDecision: { allowed: true, riskTier: 'automatic', executionMode: 'automatic' },
      requestHash: 'b'.repeat(64),
      idempotencyKey: 'negative:123:free',
      status: 'planned',
      expiresAt: '2026-09-01T00:00:00.000Z',
      createdAt: '2026-08-31T00:00:00.000Z'
    })

    expect(parsed.clientId).toBe('82c2993e-5250-4733-9220-000000000002')
    expect(parsed.providerOperations[0]?.service).toBe('adGroupCriteria')
  })
})

describe('resolveGoogleAdsPolicy', () => {
  it.each([
    ['create_budget', 'rich_confirm'],
    ['update_budget', 'rich_confirm'],
    ['update_campaign', 'rich_confirm'],
    ['update_ad_group', 'rich_confirm'],
    ['update_keyword', 'rich_confirm'],
    ['create_bidding_strategy', 'rich_confirm'],
    ['update_bidding', 'rich_confirm'],
    ['enable_campaign', 'rich_confirm'],
    ['manage_custom_audience', 'rich_confirm'],
    ['set_pmax_signals', 'rich_confirm'],
    ['set_search_themes', 'rich_confirm'],
    ['set_conversion_goal', 'rich_confirm'],
    ['create_custom_conversion_goal', 'rich_confirm'],
    ['update_custom_conversion_goal', 'rich_confirm'],
    ['archive_conversion_action', 'rich_confirm'],
    ['create_asset', 'rich_confirm'],
    ['attach_asset', 'rich_confirm'],
    ['create_asset_group', 'rich_confirm'],
    ['update_asset_group', 'rich_confirm'],
    ['manage_asset_group_assets', 'rich_confirm'],
    ['manage_listing_groups', 'rich_confirm'],
    ['apply_recommendation', 'rich_confirm'],
    ['remove_campaign', 'destructive_confirm'],
    ['remove_conversion_action', 'destructive_confirm'],
    ['archive_custom_conversion_goal', 'destructive_confirm'],
    ['archive_custom_audience', 'destructive_confirm']
  ] as const)('%s cannot be lowered below %s', (operation, riskTier) => {
    expect(resolveGoogleAdsPolicy({
      ...base,
      operation,
      accountPolicy: { enabled: true, minimumRiskTier: 'automatic' }
    })).toMatchObject({ allowed: true, riskTier, executionMode: 'proposal' })
  })

  it('allows negative-keyword automation only under an active matching policy', () => {
    expect(resolveGoogleAdsPolicy({
      ...base,
      operation: 'add_negative_keywords',
      actorRole: 'media_buyer',
      hasElevatedPermission: false,
      accountPolicy: { enabled: true, actionClass: 'negative_keywords' }
    })).toEqual({
      allowed: true,
      riskTier: 'automatic',
      executionMode: 'automatic'
    })
  })

  it('allows reversible asset-link archive automation only under its matching policy', () => {
    expect(resolveGoogleAdsPolicy({
      ...base,
      operation: 'archive_asset_link',
      actorRole: 'media_buyer',
      hasElevatedPermission: false,
      accountPolicy: { enabled: true, actionClass: 'asset_detachment' }
    })).toEqual({
      allowed: true,
      riskTier: 'automatic',
      executionMode: 'automatic'
    })
  })

  it('falls back to confirmation when automatic policy does not match', () => {
    expect(resolveGoogleAdsPolicy({
      ...base,
      operation: 'pause_campaign',
      actorRole: 'media_buyer',
      hasElevatedPermission: false,
      accountPolicy: { enabled: true, actionClass: 'negative_keywords' }
    })).toEqual({
      allowed: true,
      riskTier: 'confirm',
      executionMode: 'proposal'
    })
  })

  it.each([
    [{ globalWriteEnabled: false }, 'writes_disabled'],
    [{ hasWriteScope: false }, 'insufficient_scope'],
    [{ hasMediaPermission: false }, 'media_permission_required'],
    [{ accountPolicy: { enabled: false } }, 'account_policy_disabled']
  ] as const)('blocks writes before planning when %j', (override, code) => {
    expect(resolveGoogleAdsPolicy({
      ...base,
      operation: 'pause_campaign',
      ...override
    })).toEqual({
      allowed: false,
      riskTier: 'blocked',
      executionMode: 'blocked',
      code
    })
  })

  it('requires elevated authority for money, activation, and conversion actions', () => {
    expect(resolveGoogleAdsPolicy({
      ...base,
      operation: 'update_budget',
      actorRole: 'media_buyer',
      hasElevatedPermission: false
    })).toMatchObject({ allowed: false, code: 'elevated_permission_required' })
  })

  it('requires the destructive feature gate and an owner/admin actor for provider removal', () => {
    expect(resolveGoogleAdsPolicy({
      ...base,
      operation: 'remove_campaign',
      destructiveEnabled: false
    })).toMatchObject({ allowed: false, code: 'destructive_actions_disabled' })

    expect(resolveGoogleAdsPolicy({
      ...base,
      operation: 'remove_campaign',
      actorRole: 'lead',
      hasElevatedPermission: true
    })).toMatchObject({ allowed: false, code: 'owner_or_admin_required' })
  })

  it('allows account policy to raise but never lower a risk tier', () => {
    expect(resolveGoogleAdsPolicy({
      ...base,
      operation: 'pause_campaign',
      accountPolicy: { enabled: true, minimumRiskTier: 'rich_confirm' }
    })).toMatchObject({ allowed: true, riskTier: 'rich_confirm', executionMode: 'proposal' })
  })

  it('inherits a recommendation mutation risk derived by the typed adapter', () => {
    expect(resolveGoogleAdsPolicy({
      ...base,
      operation: 'apply_recommendation',
      actionRiskTier: 'rich_confirm',
      accountPolicy: { enabled: true, minimumRiskTier: 'automatic' }
    })).toMatchObject({ allowed: true, riskTier: 'rich_confirm', executionMode: 'proposal' })
  })

  it.each([
    ['run_search_term_policy', 'negative_keywords'],
    ['run_pause_policy', 'pause']
  ] as const)('allows an opted-in %s automation run', (operation, actionClass) => {
    expect(resolveGoogleAdsPolicy({
      ...base,
      operation,
      actorRole: 'media_buyer',
      hasElevatedPermission: false,
      accountPolicy: { enabled: true, actionClass }
    })).toMatchObject({ allowed: true, riskTier: 'automatic', executionMode: 'automatic' })
  })
})
