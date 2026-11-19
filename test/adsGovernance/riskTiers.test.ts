import { describe, expect, it } from 'vitest'
import {
  ADS_TIER_REQUIREMENTS,
  GOOGLE_ADS_OPERATION_TIERS,
  classifyAdsActionRisk,
  evaluateTierApproval,
  maxAdsRiskTier
} from '~~/server/utils/adsGovernance/riskTiers'
import { ADS_STAFF_PLAN_NAMES, ADS_STAFF_READ_NAMES } from '~~/server/utils/ai/mcp/marketingTask4Names'
import { GoogleAdsOperationTypeSchema } from '~~/server/utils/googleAds/contracts'

const requester = '11111111-1111-4111-8111-111111111111'
const reviewer = '22222222-2222-4222-8222-222222222222'

describe('classifyAdsActionRisk', () => {
  it('classifies the four tiers from operations, tool names and families', () => {
    expect(classifyAdsActionRisk('google_ads_list_campaigns')).toBe('read')
    expect(classifyAdsActionRisk('google_ads_validate_action_plan')).toBe('read')
    expect(classifyAdsActionRisk('add_negative_keywords')).toBe('low')
    expect(classifyAdsActionRisk('google_ads_plan_add_negative_keywords')).toBe('low')
    expect(classifyAdsActionRisk('negative_keywords')).toBe('low')
    for (const medium of ['update_budget', 'google_ads_plan_update_budget', 'google_ads_plan_update_bidding_strategy',
      'google_ads_plan_update_conversion_action', 'google_ads_plan_pause', 'google_ads_plan_enable', 'department_budget_allocation', 'budget']) {
      expect(classifyAdsActionRisk(medium), medium).toBe('medium')
    }
    for (const high of ['remove_campaign', 'remove_conversion_action', 'google_ads_plan_remove', 'google_ads_plan_remove_conversion_action', 'campaign_removal']) {
      expect(classifyAdsActionRisk(high), high).toBe('high')
    }
  })

  it('fails closed: unknown, malformed or generic names are high', () => {
    for (const name of ['', 'something_new', 'google_ads_plan_nuke', 'DROP TABLE', 'propose_google_ads_action', 42 as unknown as string]) {
      expect(classifyAdsActionRisk(name)).toBe('high')
    }
  })

  it('covers every Google Ads operation type (exhaustive table)', () => {
    expect(Object.keys(GOOGLE_ADS_OPERATION_TIERS).sort()).toEqual([...GoogleAdsOperationTypeSchema.options].sort())
  })

  it('never classifies a delegated staff planning tool as high, and staff reads are read', () => {
    // Delegated (non-owner) review must keep working for every existing staff plan tool.
    for (const name of ADS_STAFF_PLAN_NAMES) expect(classifyAdsActionRisk(name), name).not.toBe('high')
    for (const name of ADS_STAFF_READ_NAMES) expect(classifyAdsActionRisk(name), name).toBe('read')
  })

  it('high is never automatable; max picks the strictest tier', () => {
    expect(ADS_TIER_REQUIREMENTS.high.automatable).toBe(false)
    expect(maxAdsRiskTier('low', 'high', 'medium')).toBe('high')
    expect(maxAdsRiskTier()).toBe('read')
  })
})

describe('evaluateTierApproval', () => {
  const facts = (overrides: Record<string, unknown> = {}) => ({ requesterId: requester, reviewerId: reviewer, reviewerRole: 'account_manager', reviewerGroups: ['MARKETING_MANAGEMENT'], ...overrides })

  it('the requester can never approve their own action, at any actionable tier', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      expect(evaluateTierApproval(tier, facts({ reviewerId: requester.toUpperCase(), reviewerRole: 'owner' }))).toEqual({ ok: false, code: 'ADS_TIER_SELF_APPROVAL' })
    }
  })

  it('medium requires MARKETING_MANAGEMENT / MANAGEMENT / ADMIN or owner', () => {
    expect(evaluateTierApproval('medium', facts())).toEqual({ ok: true })
    expect(evaluateTierApproval('medium', facts({ reviewerGroups: ['MANAGEMENT'] }))).toEqual({ ok: true })
    expect(evaluateTierApproval('medium', facts({ reviewerGroups: [], reviewerRole: 'owner' }))).toEqual({ ok: true })
    expect(evaluateTierApproval('medium', facts({ reviewerGroups: ['MEDIA_BUYING'] }))).toEqual({ ok: false, code: 'ADS_TIER_MANAGER_REQUIRED' })
    expect(evaluateTierApproval('medium', facts({ reviewerGroups: null }))).toEqual({ ok: false, code: 'ADS_TIER_MANAGER_REQUIRED' })
  })

  it('high requires the owner, even for an admin marketing manager', () => {
    expect(evaluateTierApproval('high', facts({ reviewerGroups: ['ADMIN', 'MARKETING_MANAGEMENT'], reviewerRole: 'admin' }))).toEqual({ ok: false, code: 'ADS_TIER_OWNER_REQUIRED' })
    expect(evaluateTierApproval('high', facts({ reviewerRole: 'owner' }))).toEqual({ ok: true })
  })

  it('requires both identities', () => {
    expect(evaluateTierApproval('low', facts({ reviewerId: '' }))).toEqual({ ok: false, code: 'ADS_TIER_REVIEWER_REQUIRED' })
    expect(evaluateTierApproval('read', facts({ reviewerId: '' }))).toEqual({ ok: true })
  })
})
